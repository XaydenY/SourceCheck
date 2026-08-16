<script>
	import {
		IconShieldCheck,
		IconUser,
		IconSearch,
		IconHistory,
		IconInfoCircle,
		IconArrowRight,
		IconBuildingBank,
		IconBrain,
		IconQuote,
		IconFileSearch,
		IconFileText,
		IconAlertTriangle
	} from '@tabler/icons-svelte-runes';

	// Which nav tab is active: 'check' | 'history' | 'methodology'
	let activeTab = $state('check');

	// Placeholder state for the checker view — wire these up to your
	// real logic (outlet database lookup + transformers.js inference).
	let inputText = $state('');
	let hasResult = $state(true); // starts true here just so the mockup data shows; set false by default in your real app

	// Placeholder result data — replace with real values from your
	// outlet database lookup and local AI model output.
	let result = $state({
		siteName: 'schooluniformsdaily.com',
		status: 'Mixed signals', // e.g. 'Reliable', 'Mixed signals', 'Low reliability'
		statusLevel: 'moderate', // 'mild' | 'moderate' | 'strong'
		outletLeaning: 'Right-leaning',
		aiScore: '68.6% biased',
		flaggedPhrases: [
			{ tag: 'Appeal to common sense', text: '"Anyone with common sense knows..."' },
			{ tag: 'Loaded language', text: '"...chaotic fashion shows that destroy academic focus"' },
			{ tag: 'Ad hominem', text: '"...rebellious troublemakers fight against them"' }
		]
	});

	// Placeholder history data — replace with real persisted results
	// (e.g. from localStorage or IndexedDB).
	let history = $state([
		{ name: 'schooluniformsdaily.com', date: 'Checked today, 2:14 PM', status: 'Mixed signals', level: 'moderate' },
		{ name: 'dailypolicywatch.com', date: 'Checked yesterday, 4:02 PM', status: 'Low reliability', level: 'strong' },
		{ name: 'regionalnewsdesk.org', date: 'Checked yesterday, 11:47 AM', status: 'Reliable', level: 'mild' },
		{ name: 'civicbriefingtoday.com', date: 'Checked 3 days ago', status: 'Reliable', level: 'mild' }
	]);

	function runCheck() {
		// TODO: wire this up to your outlet database lookup + transformers.js inference
		hasResult = inputText.trim() !== '';
	}
</script>

<div class="app">
	<div class="header">
		<div class="header-left">
			<div class="logo"><IconShieldCheck size={18} stroke={1.75} color="var(--text-accent)" /></div>
			<p class="app-name">Lede</p>
		</div>
		<button>
			<IconUser size={14} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />
			Sign in
		</button>
	</div>

	<div class="nav">
		<button class:active={activeTab === 'check'} onclick={() => (activeTab = 'check')}>
			<IconSearch size={15} stroke={1.75} style="vertical-align:-3px; margin-right:6px;" /> Check a source
		</button>
		<button class:active={activeTab === 'history'} onclick={() => (activeTab = 'history')}>
			<IconHistory size={15} stroke={1.75} style="vertical-align:-3px; margin-right:6px;" /> History
		</button>
		<button class:active={activeTab === 'methodology'} onclick={() => (activeTab = 'methodology')}>
			<IconInfoCircle size={15} stroke={1.75} style="vertical-align:-3px; margin-right:6px;" /> Methodology
		</button>
	</div>

	{#if activeTab === 'check'}
		<div class="search-row">
			<input type="text" placeholder="Paste an article URL or text" bind:value={inputText} />
			<button onclick={runCheck}>
				<IconArrowRight size={16} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />
				Check
			</button>
		</div>

		{#if hasResult}
			<div class="card">
				<div class="status-row">
					<p>{result.siteName}</p>
					<span class="badge {result.statusLevel}">{result.status}</span>
				</div>
				<p class="subtext">2 checks run below, weigh them yourself</p>
			</div>

			<div class="metrics">
				<div class="metric">
					<p class="metric-label"><IconBuildingBank size={14} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />Outlet leaning</p>
					<p class="metric-value">{result.outletLeaning}</p>
					<p class="metric-note">Per our sourced methodology</p>
				</div>
				<div class="metric">
					<p class="metric-label"><IconBrain size={14} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />Local AI score</p>
					<p class="metric-value">{result.aiScore}</p>
					<p class="metric-note">Runs on your device</p>
				</div>
			</div>

			<div class="card" style="margin-bottom: 0;">
				<p class="phrases-title"><IconQuote size={16} stroke={1.75} style="vertical-align:-2px; margin-right:6px;" />Flagged phrases</p>
				{#each result.flaggedPhrases as phrase}
					<div class="phrase-row">
						<span class="phrase-tag">{phrase.tag}</span>
						<p class="phrase-text">{phrase.text}</p>
					</div>
				{/each}
			</div>
		{:else}
			<div class="card empty-state">
				<IconFileSearch size={28} stroke={1.5} color="var(--text-muted)" />
				<p>Paste an article URL or text above to run a check.</p>
			</div>
		{/if}
	{/if}

	{#if activeTab === 'history'}
		<div class="card" style="margin-bottom: 0;">
			{#each history as item}
				<div class="history-row">
					<div class="history-left">
						<div class="history-icon"><IconFileText size={15} stroke={1.75} color="var(--text-secondary)" /></div>
						<div style="min-width: 0;">
							<p class="history-name">{item.name}</p>
							<p class="history-date">{item.date}</p>
						</div>
					</div>
					<span class="history-badge {item.level}">{item.status}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if activeTab === 'methodology'}
		<div class="card">
			<div class="method-block">
				<p class="method-title"><IconBuildingBank size={16} stroke={1.75} color="var(--text-secondary)" />Outlet leaning</p>
				<p class="method-body">
					We maintain a small, disclosed reference list of outlets and their general political leaning, built
					from publicly available, community-vetted classifications rather than a proprietary score. This is a
					starting signal, not a verdict on any single article.
				</p>
			</div>
			<div class="method-block">
				<p class="method-title"><IconBrain size={16} stroke={1.75} color="var(--text-secondary)" />Local AI score</p>
				<p class="method-body">
					A small language model runs entirely on your device to flag loaded language, framing bias, and other
					rhetorical patterns in the text itself. Nothing you paste in is sent to a server for this step.
				</p>
			</div>
			<div class="method-block">
				<p class="method-title"><IconAlertTriangle size={16} stroke={1.75} color="var(--text-secondary)" />Limitations</p>
				<p class="method-body">
					These signals are not a final judgment of truth or falsehood. We show you the evidence behind each
					score so you can weigh it yourself, rather than asking you to trust a single number.
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(:root) {
		--surface-2: #ffffff;
		--surface-1: #f2f1ec;
		--surface-0: #f8f7f3;
		--text-primary: #1a1a18;
		--text-secondary: #5f5e5a;
		--text-muted: #888780;
		--border: #e5e3db;
		--border-strong: #d2d0c6;
		--radius: 8px;

		--bg-accent: #e1f5ee;
		--text-accent: #085041;
		--bg-mild: #e1f5ee;
		--text-mild: #085041;
		--bg-moderate: #faeeda;
		--text-moderate: #633806;
		--bg-strong: #fcebeb;
		--text-strong: #791f1f;

		--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		--font-serif: 'Source Serif 4', Georgia, 'Times New Roman', serif;
	}

	:global(body) {
		margin: 0;
		background: var(--surface-0);
		font-family: var(--font-sans);
		color: var(--text-primary);
		padding: 2.5rem 1rem;
	}

	.app {
		max-width: 680px;
		margin: 0 auto;
	}

	:global(input[type='text']) {
		height: 36px;
		border-radius: var(--radius);
		border: 0.5px solid var(--border-strong);
		background: var(--surface-2);
		padding: 0 12px;
		font-size: 14px;
		font-family: inherit;
		color: var(--text-primary);
	}

	:global(input[type='text']:focus) {
		outline: none;
		border-color: var(--text-accent);
		box-shadow: 0 0 0 2px var(--bg-accent);
	}

	:global(button) {
		height: 36px;
		border-radius: var(--radius);
		border: 0.5px solid var(--border-strong);
		background: var(--surface-2);
		font-family: inherit;
		font-size: 14px;
		cursor: pointer;
		color: var(--text-primary);
		display: inline-flex;
		align-items: center;
	}

	:global(button:hover) {
		background: var(--surface-1);
	}

	:global(button:active) {
		transform: scale(0.98);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 14px;
		border-bottom: 0.5px solid var(--border);
		margin-bottom: 4px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.logo {
		width: 32px;
		height: 32px;
		border-radius: var(--radius);
		background: var(--bg-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.app-name {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 18px;
		margin: 0;
	}

	.header button {
		padding: 0 14px;
	}

	.nav {
		display: flex;
		gap: 4px;
		margin-bottom: 1.5rem;
	}

	.nav button {
		border: none;
		background: transparent;
		font-size: 14px;
		padding: 8px 14px;
		color: var(--text-secondary);
		height: auto;
	}

	.nav button.active {
		background: var(--surface-1);
		color: var(--text-primary);
	}

	.nav button:hover {
		background: var(--surface-1);
	}

	.search-row {
		display: flex;
		gap: 8px;
		margin-bottom: 1.5rem;
	}

	.search-row input {
		flex: 1;
	}

	.search-row button {
		white-space: nowrap;
		padding: 0 14px;
	}

	.card {
		background: var(--surface-2);
		border-radius: 12px;
		border: 0.5px solid var(--border);
		padding: 1.25rem;
		margin-bottom: 1rem;
	}

	.status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.status-row p {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 17px;
		margin: 0;
	}

	.badge {
		font-size: 12px;
		padding: 3px 10px;
		border-radius: var(--radius);
		background: var(--bg-moderate);
		color: var(--text-moderate);
	}

	.badge.mild {
		background: var(--bg-mild);
		color: var(--text-mild);
	}

	.badge.moderate {
		background: var(--bg-moderate);
		color: var(--text-moderate);
	}

	.badge.strong {
		background: var(--bg-strong);
		color: var(--text-strong);
	}

	.subtext {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 0;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
		margin-bottom: 1.5rem;
	}

	.metric {
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 1rem;
	}

	.metric-label {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 0 0 4px;
		display: flex;
		align-items: center;
	}

	.metric-value {
		font-family: var(--font-serif);
		font-size: 21px;
		font-weight: 600;
		margin: 0 0 2px;
	}

	.metric-note {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0;
	}

	.phrases-title {
		font-weight: 500;
		font-size: 15px;
		margin: 0 0 12px;
		display: flex;
		align-items: center;
	}

	.phrase-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 0;
		border-top: 0.5px solid var(--border);
	}

	.phrase-row:first-of-type {
		border-top: none;
	}

	.phrase-tag {
		background: var(--bg-moderate);
		color: var(--text-moderate);
		font-size: 12px;
		padding: 3px 10px;
		border-radius: var(--radius);
		white-space: nowrap;
		margin-top: 1px;
	}

	.phrase-text {
		font-size: 13px;
		margin: 0;
		color: var(--text-secondary);
	}

	.history-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 0.5px solid var(--border);
	}

	.history-row:first-child {
		border-top: none;
	}

	.history-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.history-icon {
		width: 32px;
		height: 32px;
		border-radius: var(--radius);
		background: var(--surface-1);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.history-name {
		font-size: 14px;
		margin: 0 0 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-date {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0;
	}

	.history-badge {
		font-size: 12px;
		padding: 3px 10px;
		border-radius: var(--radius);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.history-badge.moderate {
		background: var(--bg-moderate);
		color: var(--text-moderate);
	}

	.history-badge.strong {
		background: var(--bg-strong);
		color: var(--text-strong);
	}

	.history-badge.mild {
		background: var(--bg-mild);
		color: var(--text-mild);
	}

	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.empty-state p {
		font-size: 13px;
		color: var(--text-muted);
		margin: 8px 0 0;
	}

	.method-block {
		margin-bottom: 1.25rem;
	}

	.method-block:last-child {
		margin-bottom: 0;
	}

	.method-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		font-size: 15px;
		margin: 0 0 6px;
	}

	.method-body {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0;
	}
</style>