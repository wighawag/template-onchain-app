/**
 * Copy-to-clipboard with transient "copied" feedback.
 *
 * Owns the `copied` flag and its auto-reset timeout so components don't each
 * re-implement `writeText -> copied = true -> setTimeout(reset)`.
 *
 * ```svelte
 * const clipboard = useCopyToClipboard();
 * <button onclick={() => clipboard.copy(value)}>
 *   {clipboard.copied ? 'Copied' : 'Copy'}
 * </button>
 * ```
 *
 * @param resetMs how long the `copied` flag stays true (default 1000ms).
 */
export function useCopyToClipboard(resetMs = 1000) {
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(text: string): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => (copied = false), resetMs);
			return true;
		} catch {
			return false;
		}
	}

	return {
		get copied() {
			return copied;
		},
		copy,
	};
}
