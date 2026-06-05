export const generateLabels = (pattern, start, count) => {
    const labels = [];
    const startNum = parseInt(start, 10) || 1;
    for (let i = 0; i < count; i++) {
        let currentNum = startNum + i;
        let label = pattern;

        if (label.includes('{nnn}')) {
            label = label.replace('{nnn}', String(currentNum).padStart(3, '0'));
        } else if (label.includes('{nn}')) {
            label = label.replace('{nn}', String(currentNum).padStart(2, '0'));
        } else if (label.includes('{n}')) {
            label = label.replace('{n}', String(currentNum));
        } else if (label.includes('{A}')) {
            const char = String.fromCharCode(65 + ((currentNum - 1) % 26)); 
            label = label.replace('{A}', char);
        } else if (label.includes('{a}')) {
            const char = String.fromCharCode(97 + ((currentNum - 1) % 26));
            label = label.replace('{a}', char);
        }
        labels.push(label);
    }
    return labels;
};