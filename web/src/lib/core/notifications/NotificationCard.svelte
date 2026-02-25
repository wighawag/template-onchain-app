<script lang="ts">
	import type {NotificationClasses} from './types';
	import {fly} from 'svelte/transition';
	import {cn} from '$lib/core/utils/tailwind/index.js';

	export interface NotificationAction {
		label: string;
		onClick: () => void;
		primary?: boolean;
	}

	interface Props {
		title: string;
		body?: string;
		icon?: string;
		actions?: NotificationAction[];
		onClose?: () => void;
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {
		title,
		body,
		icon,
		actions = [],
		onClose,
		class: className = '',
		classes = {},
	}: Props = $props();
</script>

<!--
Notification panel, dynamically insert this into the live region when it needs to be displayed

Entering: "transform ease-out duration-300 transition"
  From: "translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
  To: "translate-y-0 opacity-100 sm:translate-x-0"
Leaving: "transition ease-in duration-100"
  From: "opacity-100"
  To: "opacity-0"
-->
<div
	class={cn(
		'pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/5',
		className,
		classes.root,
	)}
	transition:fly={{delay: 250, duration: 300, x: +100}}
>
	<div class="p-4">
		<div class="flex items-start">
			<div class="shrink-0">
				{#if icon}
					<img src={icon} alt="icon" />
				{:else}
					<svg
						class={cn('size-6 text-gray-400', classes.icon)}
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						aria-hidden="true"
						data-slot="icon"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"
						/>
					</svg>
				{/if}
			</div>
			<div class="ml-3 w-0 flex-1 pt-0.5">
				<p class={cn('text-sm font-medium text-gray-900', classes.title)}>
					{title}
				</p>
				{#if body}
					<p class={cn('mt-1 text-sm text-gray-500', classes.body)}>{body}</p>
				{/if}
				{#if actions.length > 0}
					<div class={cn('mt-3 flex space-x-7', classes.actions)}>
						{#each actions as action}
							<button
								type="button"
								class={cn(
									'rounded-md bg-white text-sm font-medium hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none',
									action.primary
										? cn(
												'text-indigo-600 hover:text-indigo-500',
												classes.primaryButton,
											)
										: cn('text-gray-700', classes.button),
								)}
								onclick={() => action.onClick()}>{action.label}</button
							>
						{/each}
					</div>
				{/if}
			</div>
			{#if onClose}
				<div class="ml-4 flex shrink-0">
					<button
						type="button"
						class={cn(
							'inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none',
							classes.closeButton,
						)}
						onclick={onClose}
					>
						<span class="sr-only">Close</span>
						<svg
							class="size-5"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
							data-slot="icon"
						>
							<path
								d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
							/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
