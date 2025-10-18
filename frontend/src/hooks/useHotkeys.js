import { useEffect } from 'react';

const useHotkeys = (hotkeys) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            const { target, key } = event;
            if (!key) return;
            const action = hotkeys[key.toLowerCase()];

            if (action && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
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
