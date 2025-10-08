import { useEffect } from 'react';

const useHotkeys = (hotkeys) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            // Check if the event target is an input, textarea, or select element
            const targetTagName = event.target.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(targetTagName)) {
                // Don't trigger hotkeys if the user is typing in an input field
                return;
            }

            const key = event.key.toLowerCase();
            const action = hotkeys[key];
            
            if (action) {
                event.preventDefault(); // Prevent the default action of the key press
                action(event);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [hotkeys]);
};

export default useHotkeys;