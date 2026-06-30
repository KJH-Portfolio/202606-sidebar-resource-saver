import { Plugin } from 'obsidian';

export default class SidebarResourceSaverPlugin extends Plugin {
    observer: MutationObserver | null = null;
    wasLeftCollapsed: boolean = false;
    wasRightCollapsed: boolean = false;

    async onload() {
        console.log('Loading Sidebar Resource Saver Plugin (Ultimate Edition)');
        
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
        const split = isLeft ? (this.app.workspace as any).leftSplit : (this.app.workspace as any).rightSplit;
        if (!split) return;

        const isCollapsed = split.collapsed;
        
        if (isLeft) {
            if (isCollapsed !== this.wasLeftCollapsed) {
                this.wasLeftCollapsed = isCollapsed;
                console.log(`[SidebarResourceSaver] Left sidebar collapsed changed to: ${isCollapsed}`);
                if (isCollapsed) this.unloadResources('left');
                else this.reloadResources('left');
            }
        } else {
            if (isCollapsed !== this.wasRightCollapsed) {
                this.wasRightCollapsed = isCollapsed;
                console.log(`[SidebarResourceSaver] Right sidebar collapsed changed to: ${isCollapsed}`);
                if (isCollapsed) this.unloadResources('right');
                else this.reloadResources('right');
            }
        }
    }

    getWebviewsInSidebar(name: string): Element[] {
        const webviews: Element[] = [];
        // 옵시디언 화면 전체를 싹쓸이하여 브라우저 객체를 모조리 찾습니다.
        const allWebviews = document.querySelectorAll('iframe, webview');
        console.log(`[SidebarResourceSaver] Total webviews in document: ${allWebviews.length}`);
        
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
        console.log(`[SidebarResourceSaver] unloadResources (${name}): Found ${elements.length} elements`);
        
        elements.forEach((el: Element) => {
            const htmlEl = el as any;
            
            // Surfing 플러그인의 눈을 가리는 이벤트 쉴드(Event Shield) 장착
            if (!htmlEl.__resourceSaverShield) {
                const EVENTS_TO_BLOCK = [
                    'did-start-loading', 'load-commit', 'page-title-updated', 
                    'page-favicon-updated', 'did-navigate', 'did-navigate-in-page',
                    'did-finish-load', 'did-stop-loading', 'did-fail-load'
                ];
                
                htmlEl.__resourceSaverShield = (e: any) => {
                    const url = e.url || (typeof htmlEl.getURL === 'function' ? htmlEl.getURL() : htmlEl.src);
                    if (url === 'about:blank' || url === 'data:text/html,') {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    }
                };
                
                EVENTS_TO_BLOCK.forEach(ev => {
                    htmlEl.addEventListener(ev, htmlEl.__resourceSaverShield, true);
                });
            }

            const currentUrl = typeof htmlEl.getURL === 'function' ? htmlEl.getURL() : htmlEl.src;
            console.log(`[SidebarResourceSaver] Saving URL: ${currentUrl}`);
            
            if (currentUrl && currentUrl !== 'about:blank' && currentUrl !== 'data:text/html,') {
                htmlEl.setAttribute('data-saved-url', currentUrl);
                
                try {
                    // 일렉트론 에러를 피하기 위해 요소는 그대로 두고 내부 주소만 비웁니다.
                    if (typeof htmlEl.loadURL === 'function') {
                        htmlEl.loadURL('about:blank');
                        console.log(`[SidebarResourceSaver] loadURL('about:blank') executed`);
                    } else {
                        htmlEl.src = 'about:blank';
                        console.log(`[SidebarResourceSaver] src = 'about:blank' executed`);
                    }
                } catch (err) {
                    console.error(`[SidebarResourceSaver] Failed to unload URL:`, err);
                }
            }
        });
    }

    reloadResources(name: string) {
        const elements = this.getWebviewsInSidebar(name);
        console.log(`[SidebarResourceSaver] reloadResources (${name}): Found ${elements.length} elements`);
        
        elements.forEach((el: Element) => {
            const htmlEl = el as any;
            const savedUrl = htmlEl.getAttribute('data-saved-url');
            console.log(`[SidebarResourceSaver] Reloading URL: ${savedUrl}`);
            
            if (savedUrl) {
                try {
                    if (typeof htmlEl.loadURL === 'function') {
                        htmlEl.loadURL(savedUrl);
                        console.log(`[SidebarResourceSaver] loadURL(savedUrl) executed`);
                    } else {
                        htmlEl.src = savedUrl;
                        console.log(`[SidebarResourceSaver] src = savedUrl executed`);
                    }
                } catch (err) {
                    console.error(`[SidebarResourceSaver] Failed to reload URL:`, err);
                }
                htmlEl.removeAttribute('data-saved-url');
            }
        });
    }

    onunload() {
        console.log('Unloading Sidebar Resource Saver Plugin');
        this.reloadResources('left');
        this.reloadResources('right');
    }
}
