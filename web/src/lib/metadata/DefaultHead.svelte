<script lang="ts">
	import {
		name,
		description,
		themeColor,
		canonicalURL,
		appleStatusBarStyle,
		ENSName,
	} from '../../web-config.json';
	import Head from '$lib/core/metadata/Head.svelte';

	interface Props {
		type?: 'website' | 'article';
		title?: string;
		description?: string;
		image?: string;
	}

	const host = canonicalURL.endsWith('/')
		? canonicalURL.slice(0, -1)
		: canonicalURL;
	const previewImage = host + '/preview.png';

	let overrides: Props = $props();

	let metadata = $derived({
		type: overrides.type || 'website',
		title: overrides.title || name,
		description: overrides.description || description,
		image: overrides.image || previewImage,
	});
</script>

<Head
	{host}
	title={metadata.title}
	description={metadata.description}
	{ENSName}
	{appleStatusBarStyle}
	{themeColor}
	image={metadata.image}
	{name}
	type={metadata.type}
></Head>
