import { useEffect } from 'react';

const useHotkeys = (hotkeys) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            const { target, key } = event;

            // Do not capture hotkeys if the user is typing in an input, textarea, or select field.
            if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                return;
            }
            
            if (!key) return;

            const action = hotkeys[key.toLowerCase()];

            if (action) {
                event.preventDefault();
                action();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [hotkeys]);
};

export default useHotkeys;
