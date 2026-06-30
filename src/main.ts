import { Plugin } from 'obsidian';

interface ObsidianWorkspaceExt {
    leftSplit?: { collapsed: boolean };
    rightSplit?: { collapsed: boolean };
}

interface WebviewElement extends Element {
    src?: string;
    getURL?: () => string;
    loadURL?: (url: string) => void;
    reload?: (...args: unknown[]) => void;
    __resourceSaverReloadPatched?: boolean;
    __resourceSaverShield?: (e: Event & { url?: string, stopImmediatePropagation: () => void, stopPropagation: () => void }) => void;
    style: CSSStyleDeclaration;
}

export default class SidebarResourceSaverPlugin extends Plugin {
    observer: MutationObserver | null = null;
    wasLeftCollapsed: boolean = false;
    wasRightCollapsed: boolean = false;

    async onload() {
        
        this.app.workspace.onLayoutReady(() => {
            this.setupObserver();
            // 초기 상태 체크 (시작하자마자 접혀있을 경우 메모리 회수)
            this.checkSidebarState(true);
            this.checkSidebarState(false);
        });
    }

    setupObserver() {
        // DOM 변화나 옵시디언 이벤트에 전혀 의존하지 않고, 0.5초마다 강제로 상태를 체크하는 무적의 폴링 방식을 사용합니다.
        // 상태값만 확인하므로 성능 저하는 0에 수렴합니다.
        this.registerInterval(
            window.setInterval(() => {
                this.checkSidebarState(true);
                this.checkSidebarState(false);
            }, 500)
        );
    }

    checkSidebarState(isLeft: boolean) {
        const split = isLeft ? (this.app.workspace as unknown as ObsidianWorkspaceExt).leftSplit : (this.app.workspace as unknown as ObsidianWorkspaceExt).rightSplit;
        if (!split) return;

        const isCollapsed = split.collapsed;
        
        if (isLeft) {
            if (isCollapsed !== this.wasLeftCollapsed) {
                this.wasLeftCollapsed = isCollapsed;
                if (isCollapsed) this.unloadResources('left');
                else this.reloadResources('left');
            }
        } else {
            if (isCollapsed !== this.wasRightCollapsed) {
                this.wasRightCollapsed = isCollapsed;
                if (isCollapsed) this.unloadResources('right');
                else this.reloadResources('right');
            }
        }
    }

    getWebviewsInSidebar(name: string): Element[] {
        const webviews: Element[] = [];
        // 옵시디언 화면 전체를 싹쓸이하여 브라우저 객체를 모조리 찾습니다.
        const allWebviews = activeDocument.querySelectorAll('iframe, webview');
        
        allWebviews.forEach(el => {
            // 부모 객체를 거꾸로 타고 올라가 자신이 어느 사이드바 출신인지 검사합니다.
            let parent = el.parentElement;
            let isLeft = false;
            let isRight = false;
            while (parent) {
                if (parent.classList.contains('mod-left-split')) isLeft = true;
                if (parent.classList.contains('mod-right-split')) isRight = true;
                parent = parent.parentElement;
            }
            if (name === 'left' && isLeft) webviews.push(el);
            if (name === 'right' && isRight) webviews.push(el);
        });
        
        return webviews;
    }

    unloadResources(name: string) {
        const elements = this.getWebviewsInSidebar(name);
        
        elements.forEach((el: Element) => {
            const htmlEl = el as unknown as WebviewElement;
            
            // Surfing 플러그인의 눈을 가리는 이벤트 쉴드(Event Shield) 장착
            if (!htmlEl.__resourceSaverShield) {
                const EVENTS_TO_BLOCK = [
                    'did-start-loading', 'load-commit', 'page-title-updated', 
                    'page-favicon-updated', 'did-navigate', 'did-navigate-in-page',
                    'did-finish-load', 'did-stop-loading', 'did-fail-load'
                ];
                
                htmlEl.__resourceSaverShield = (e: Event & { url?: string, stopImmediatePropagation: () => void, stopPropagation: () => void }) => {
                    const url = e.url || (typeof htmlEl.getURL === 'function' ? htmlEl.getURL() : htmlEl.src);
                    if (url === 'about:blank' || url === 'data:text/html,') {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    }
                };
                
                EVENTS_TO_BLOCK.forEach(ev => {
                    htmlEl.addEventListener(ev, htmlEl.__resourceSaverShield as EventListener, true);
                });
            }

            const currentUrl = typeof htmlEl.getURL === 'function' ? htmlEl.getURL() : htmlEl.src;
            
            // [버그 방어막 1] 오직 정상적인 웹사이트(http/https) 주소일 때만 저장합니다.
            // 에러 페이지나 빈 화면 주소가 덮어씌워지는 치명적인 버그를 원천 차단합니다.
            if (currentUrl && currentUrl.startsWith('http')) {
                htmlEl.setAttribute('data-saved-url', currentUrl);
            }
                
            try {
                    // 일렉트론 에러를 피하기 위해 요소는 그대로 두고 내부 주소만 비웁니다.
                    if (typeof htmlEl.loadURL === 'function') {
                        htmlEl.loadURL('about:blank');
                    } else {
                        htmlEl.src = 'about:blank';
                    }
                } catch {
                    // 무시
                }
        });
    }

    reloadResources(name: string) {
        const elements = this.getWebviewsInSidebar(name);
        
        elements.forEach((el: Element) => {
            const htmlEl = el as unknown as WebviewElement;
            const savedUrl = htmlEl.getAttribute('data-saved-url');
            
            // [버그 방어막 3] 에러 스티커(오버레이) 강제 철거 및 웹뷰 시야 복구
            try {
                const parent = htmlEl.parentElement;
                if (parent) {
                    const divs = parent.querySelectorAll('div');
                    for (let i = 0; i < divs.length; i++) {
                        const div = divs[i] as HTMLElement;
                        if (div.textContent && (div.textContent.includes('해당 웹사이트를 로드할 수 없음') || div.textContent.includes('ERR_'))) {
                            div.classList.add('sidebar-saver-hidden');
                        }
                    }
                }
                // 숨겨진 웹뷰 강제 복구
                if (htmlEl.style.getPropertyValue('display') === 'none') htmlEl.style.removeProperty('display');
                htmlEl.classList.remove('hidden');
            } catch {
                // 무시
            }
            
            // [버그 방어막 2] 새로고침(reload) 가로채기
            if (typeof htmlEl.reload === 'function' && !htmlEl.__resourceSaverReloadPatched) {
                const originalReload = htmlEl.reload;
                htmlEl.reload = function(...args: unknown[]) {
                    const current = typeof htmlEl.getURL === 'function' ? htmlEl.getURL() : htmlEl.src;
                    const saved = htmlEl.getAttribute('data-saved-url');
                    
                    // 현재 주소가 정상(http)이 아닌데(에러 페이지) 새로고침을 시도하면,
                    // 에러 페이지를 새로고침하는 대신 우리가 저장해둔 '진짜 주소'로 강제 복구시킵니다.
                    if (current && !current.startsWith('http') && saved && saved.startsWith('http')) {
                        if (typeof htmlEl.loadURL === 'function') htmlEl.loadURL(saved);
                        else htmlEl.src = saved;
                        return;
                    }
                    
                    // 정상적인 웹서핑 중에는 100% 원래의 새로고침 기능을 수행합니다.
                    if (originalReload) originalReload.apply(htmlEl, args);
                };
                htmlEl.__resourceSaverReloadPatched = true;
            }
            
            if (savedUrl) {
                try {
                    if (typeof htmlEl.loadURL === 'function') {
                        htmlEl.loadURL(savedUrl);
                    } else {
                        htmlEl.src = savedUrl;
                    }
                } catch {
                    // 무시
                }
                htmlEl.removeAttribute('data-saved-url');
            }
        });
    }

    onunload() {
        this.reloadResources('left');
        this.reloadResources('right');
    }
}
