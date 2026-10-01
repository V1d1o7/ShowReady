// Talks to a switch's console port via the Web Serial API (Chrome/Edge only, requires
// a USB-to-serial adapter). No ShowReady backend or network reachability involved at
// all -- this is the fallback for switches that aren't on a reachable OOB network yet,
// or whose driver doesn't support REST.
//
// Prompt-detection (the `expect_regex` on each command, from GET
// /switches/{id}/cli_commands) is the part most likely to need bench iteration against
// real hardware -- see the driver's module docstring for what's confirmed vs. guessed.

export function isSerialSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
}

// Must be called from a user gesture (e.g. a button click handler).
export async function requestSwitchSerialPort() {
    if (!isSerialSupported()) {
        throw new Error('Web Serial isn\'t available in this browser. Use Chrome or Edge for console-cable configuration.');
    }
    return navigator.serial.requestPort();
}

async function readUntil(reader, regex, { buffer, timeoutMs = 10000 }) {
    const pattern = new RegExp(regex, 'm');
    const deadline = Date.now() + timeoutMs;
    let text = buffer;

    if (pattern.test(text)) {
        return { ok: true, output: text, remainder: '' };
    }

    while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) text += value;
        if (pattern.test(text)) {
            return { ok: true, output: text, remainder: '' };
        }
    }
    return { ok: false, output: text, remainder: text };
}

// Runs an ordered CLI command plan (the `{ baud_rate, commands }` shape from
// GET /switches/{id}/cli_commands) against an already-selected SerialPort. Calls
// onStepUpdate(index, result) after each command so the caller can render live
// progress. Commands marked `implemented: false` are skipped, not sent.
export async function runSwitchCliPlan(port, { baud_rate: baudRate, commands }, onStepUpdate) {
    await port.open({ baudRate });

    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    const writer = textEncoder.writable.getWriter();

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    const results = [];
    let buffer = '';

    try {
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];

            if (!cmd.implemented) {
                const result = { status: 'skipped', message: 'Not yet supported for this switch -- skipped.' };
                results.push(result);
                onStepUpdate?.(i, result);
                continue;
            }

            if (cmd.command) {
                await writer.write(`${cmd.command}\r\n`);
            }

            const { ok, output, remainder } = await readUntil(reader, cmd.expect_regex, { buffer });
            buffer = remainder;

            const result = ok
                ? { status: 'success', message: null }
                : { status: 'failed', message: `Timed out waiting for the expected prompt. Last output: ${output.slice(-200)}` };
            results.push(result);
            onStepUpdate?.(i, result);
        }
    } finally {
        await writer.close().catch(() => {});
        await writableStreamClosed.catch(() => {});
        reader.releaseLock();
        await readableStreamClosed.catch(() => {});
        await port.close().catch(() => {});
    }

    return results;
}
