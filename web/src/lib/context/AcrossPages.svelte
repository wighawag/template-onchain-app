<script lang="ts">
	import {getUserContext, params} from '$lib';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {DebugOperations} from '$lib/ui/debug';
	import {PendingOperationModal} from '$lib/ui/pending-operation';

	const {connection} = getUserContext();
</script>

{#if params.transactions}
	<DebugOperations />
{/if}

<ConnectionFlow {connection} />
<PendingOperationModal />
