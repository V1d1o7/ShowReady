// Loose check: does this equipment template represent an installable module
// (SFP, PCIe card, VFC card, etc.) rather than a rack-mountable device?
// Modules can only be installed into a host device's slot — they must never be
// placed directly into a rack unit. The check is intentionally permissive
// because `is_module` can arrive as a real boolean, a string, or 1/0 depending
// on the source, and legacy module templates were saved with `ru_height` 0.
export const isModuleTemplate = (tpl) => {
    if (!tpl) return false;
    return tpl.is_module === true
        || tpl.is_module === 'true'
        || tpl.is_module === 1
        || tpl.ru_height === 0;
};
