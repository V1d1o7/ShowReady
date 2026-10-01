import { useEffect } from 'react';

const useHotkeys = (hotkeys) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            const { target, key } = event;
            if (!key) return;
            const normalizedKey = key.toLowerCase();

            // Do not capture hotkeys if the user is typing in an input, textarea, select
            // field, or contenteditable element -- except Escape, which must always be able
            // to back out of whatever's focused (a modal's own text field, a rich-text
            // editor, etc.) instead of being swallowed by the field itself. This is what
            // "close modals on Esc" (CLAUDE.md) actually depends on for every modal wired
            // through this hook.
            if (normalizedKey !== 'escape' && target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
                return;
            }

            const action = hotkeys[normalizedKey];

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