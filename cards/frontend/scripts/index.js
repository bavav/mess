
document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-item');
    const pages = {
        home: document.getElementById('home'),
        search: document.getElementById('search'),
        notifications: document.getElementById('notifications'),
        profile: document.getElementById('profile')
    };
    function switchTab(activeTabId) {
        Object.values(pages).forEach(page => {
            page.classList.remove('active');
        });
        tabs.forEach(tab => {
            tab.classList.remove('active');
        });

        pages[activeTabId].classList.add('active');
        const activeTab = Array.from(tabs).find(tab => tab.dataset.tab === activeTabId);
        if (activeTab) activeTab.classList.add('active');
    }
    
    console.log("hi2")
    tabs.forEach(tab => {
        console.log("hi")
        tab.addEventListener('click', (e) => {
            const tabId = tab.dataset.tab;
            
            if (tabId) switchTab(tabId);
        });
    });
})

// Опционально: фикс для iOS, чтобы скролл работал плавно
if ('ontouchstart' in window) {
    document.querySelector('.content').style.webkitOverflowScrolling = 'touch';
}