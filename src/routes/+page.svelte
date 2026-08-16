<script>
	import { onMount } from 'svelte';
	import { classifyBias, preloadBiasModel, setProgressCallback } from '$lib/biasClassifier.js';
	import { lookupOutlet } from '$lib/outletLookup.js';
	import {
		IconUser,
		IconSearch,
		IconHistory,
        IconAlignBoxCenterMiddle,
		IconInfoCircle,
		IconArrowRight,
		IconBuildingBank,
		IconBrain,
		IconQuote,
		IconFileSearch,
		IconFileText,
		IconAlertTriangle,
		IconWorld,
		IconExclamationCircle
	} from '@tabler/icons-svelte-runes';

	let activeTab = $state('check');

	let modelProgress = $state(0);
	let checking = $state(false);
	let extractError = $state(/** @type {string | null} */ (null));

	onMount(() => {
		setProgressCallback((p) => {
			if (p.status === 'progress' && typeof p.progress === 'number') modelProgress = p.progress;
		});
		preloadBiasModel();
	});

	let inputText = $state('');
	let extractedText = $state('');
	let hasResult = $state(false);

	/**
	 * @typedef {{ tag: string, text: string }} FlaggedPhrase
	 * @typedef {{ siteName: string, status: string, statusLevel: string, outletLeaning: string, rating: string | null, aiScore: string, outletFound: boolean, flaggedPhrases: FlaggedPhrase[] }} ResultState
	 */

	let result = $state(/** @type {ResultState} */ ({
		siteName: '',
		status: '',
		statusLevel: '',
		outletLeaning: '',
		rating: null,
		aiScore: '',
		outletFound: false,
		flaggedPhrases: []
	}));

	let history = $state([
		{ name: 'schooluniformsdaily.com', date: 'Checked today, 2:14 PM', status: 'Mixed signals', level: 'moderate' },
		{ name: 'dailypolicywatch.com', date: 'Checked yesterday, 4:02 PM', status: 'Low reliability', level: 'strong' },
		{ name: 'regionalnewsdesk.org', date: 'Checked yesterday, 11:47 AM', status: 'Reliable', level: 'mild' },
		{ name: 'civicbriefingtoday.com', date: 'Checked 3 days ago', status: 'Reliable', level: 'mild' }
	]);

	/** Returns true if the input looks like a URL
	 * @param {string} text
	 * @returns {boolean}
	 */
	function isURL(text) {
		return /^https?:\/\//i.test(text.trim()) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(text.trim());
	}

	/** Returns a color-class key for a raw AllSides rating.
	 * @param {string | null} rating
	 * @returns {string}
	 */
	function ratingColorClass(rating) {
		switch (rating) {
			case 'left': return 'lean-left';
			case 'left-center': return 'lean-left-center';
			case 'center': return 'lean-center';
			case 'right-center': return 'lean-right-center';
			case 'right': return 'lean-right';
			case 'allsides': return 'lean-center';
			default: return 'lean-unknown';
		}
	}

	async function runCheck() {
		if (!inputText.trim()) return;
		checking = true;
		hasResult = false;
		extractError = null;

		try {
			let textToCheck = inputText.trim();
				/** @type {{ name: string | null, rating: string | null, leaning: string | null, ratingNum: number | null, percAgree: number | null, found: boolean }} */
				let outletInfo = { name: null, rating: null, leaning: null, ratingNum: null, percAgree: null, found: false };
				let articleTitle = null;
				extractedText = '';
			if (isURL(textToCheck)) {
				outletInfo = lookupOutlet(textToCheck);

				const extractRes = await fetch('/api/extract', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: textToCheck }),
				});

				const extractData = await extractRes.json();

				if (!extractRes.ok || extractData.error) {
					extractError = extractData.error || 'Failed to extract article text';
					checking = false;
					return;
				}

				const scrapedText = extractData.text;
				articleTitle = extractData.title;

				// Safety: never send the raw URL into the AI model. If the scraper
				// produced little or no text (or somehow returned a URL), stop
				// instead of classifying garbage.
				if (!scrapedText || scrapedText.replace(/\s+/g, '').length < 20 || isURL(scrapedText)) {
					extractError = 'Could not extract article text from this URL. Try pasting the text directly.';
					checking = false;
					return;
				}

				textToCheck = scrapedText;
				extractedText = scrapedText;
			} else {
				// Pasted text — show it in the textarea so the user sees what's analyzed
				extractedText = textToCheck;
			}

			// Run the bias classifier on the text
			const biasResult = await classifyBias(textToCheck);

			// Build the result. The model outputs a confidence score for its
			// chosen label. Higher = more confident the text is biased.
			const isBiased = biasResult.label === 'BIASED';
			const biasScore = isBiased ? biasResult.score : (1 - biasResult.score);
			const biasPercent = (biasScore * 100).toFixed(1);

			// Viewer agreement (AllSides community) — how strongly people agree
			// the outlet is biased. 0..1, higher = more one-sided audience.
			const communityBias = outletInfo.percAgree ?? null;

			let siteName = '';
			let outletLeaning = '';
			let status;
			let statusLevel;

			if (outletInfo.found) {
				siteName = outletInfo.name ?? '';
				outletLeaning = outletInfo.leaning ?? '';
			} else if (isURL(inputText.trim())) {
				// URL was provided but no outlet match
				try {
					const domain = new URL(inputText.trim()).hostname.replace(/^www\./i, '');
					siteName = domain;
				} catch {
					siteName = inputText.trim();
				}
				outletLeaning = 'Unknown';
			} else {
				// Plain text input — no URL to look up
				siteName = 'Pasted text';
				outletLeaning = 'N/A';
			}

			// Determine overall status. Anything at/above the bias threshold is
			// flagged as "Biased" (bright red); below it, "Reliable".
			// Threshold: 60% — matches the AI score sensitivity above.
			if (biasScore >= 0.6) {
				status = 'Biased';
				statusLevel = 'biased';
			} else {
				status = 'Reliable';
				statusLevel = 'mild';
			}

			// Label the AI score based on sensitivity
			let aiScoreLabel;
			if (biasScore >= 0.8) {
				aiScoreLabel = `${biasPercent}% strongly biased`;
			} else if (biasScore >= 0.6) {
				aiScoreLabel = `${biasPercent}% biased`;
			} else {
				aiScoreLabel = `${biasPercent}% neutral`;
			}

			result = {
				siteName,
				status,
				statusLevel,
				outletLeaning,
				rating: outletInfo.rating,
				aiScore: aiScoreLabel,
				outletFound: outletInfo.found,
				flaggedPhrases: []
			};

			hasResult = true;
		} catch (err) {
			console.error('Bias check failed:', err);
			extractError = 'An unexpected error occurred. Please try again.';
		} finally {
			checking = false;
		}
	}
</script>

<div class="app">
	<div class="header">
		<div class="header-left">
			<div class="logo"><IconAlignBoxCenterMiddle size={20} stroke={1.75} color="var(--text-accent)" /></div>
			<h1 class="app-name">SourceCheck</h1>
		</div>
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
			<button onclick={runCheck} disabled={checking}>
				<IconArrowRight size={16} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />
				{checking ? 'Checking…' : 'Check'}
			</button>
		</div>

		{#if checking}
			<div class="progress-row">
				<div class="progress-bar"><div class="progress-fill" style="width: {modelProgress * 1}%"></div></div>
				<p class="progress-label">Loading local AI model… {Math.round(modelProgress * 1)}%</p>
			</div>
		{/if}

		{#if extractedText}
			<div class="extract-box">
				<p class="extract-title"><IconFileText size={14} stroke={1.75} style="vertical-align:-2px; margin-right:6px;" />Text being analyzed</p>
				<textarea readonly value={extractedText} rows={8}></textarea>
			</div>
		{/if}

		{#if extractError}
			<div class="card error-card">
				<IconExclamationCircle size={18} stroke={1.75} color="var(--text-strong)" />
				<p>{extractError}</p>
			</div>
		{/if}

		{#if hasResult}
			<div class="card">
				<div class="status-row">
					<p>{result.siteName}</p>
					<span class="badge {result.statusLevel}">{result.status}</span>
				</div>
				<p class="subtext">
					{#if result.outletFound}
						2 checks run below, weigh them yourself
					{:else if result.outletLeaning === 'Unknown'}
						No outlet found in our database — AI check only
					{:else if result.outletLeaning === 'N/A'}
						AI check run on pasted text
					{:else}
						AI check run below, weigh it yourself
					{/if}
				</p>
			</div>

			<div class="metrics">
				<div class="metric">
					<p class="metric-label"><IconBuildingBank size={14} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />Outlet leaning</p>
					<p class="metric-value">
						{#if result.outletFound}
							<span class="lean-badge {ratingColorClass(result.rating)}">{result.outletLeaning}</span>
						{:else}
							{result.outletLeaning}
						{/if}
					</p>
					<p class="metric-note">
						{#if result.outletFound}
							Per our sourced methodology
						{:else if result.outletLeaning === 'Unknown'}
							Not in our database yet
						{:else}
							No URL provided
						{/if}
					</p>
				</div>
				<div class="metric">
					<p class="metric-label"><IconBrain size={14} stroke={1.75} style="vertical-align:-2px; margin-right:4px;" />Local AI score</p>
					<p class="metric-value">{result.aiScore}</p>
					<p class="metric-note">Runs on your device</p>
				</div>
			</div>

			{#if result.flaggedPhrases.length > 0}
				<div class="card" style="margin-bottom: 0;">
					<p class="phrases-title"><IconQuote size={16} stroke={1.75} style="vertical-align:-2px; margin-right:6px;" />Flagged phrases</p>
					{#each result.flaggedPhrases as phrase}
						<div class="phrase-row">
							<span class="phrase-tag">{phrase.tag}</span>
							<p class="phrase-text">{phrase.text}</p>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="card empty-state">
				<IconFileSearch size={28} stroke={1.5} color="var(--text-muted)" />
				<p>Paste an article URL or text above to run a check.</p>
			</div>
		{/if}

		<div class="scraper-note">
			<IconAlertTriangle size={14} stroke={1.75} style="vertical-align:-2px; margin-right:6px;" />
			The web scraper doesn't always work on every site. If it fails, copy the article text and paste it directly above.
		</div>
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
					We source outlet leaning data from AllSides, a media research organization that evaluates
					news outlets for bias and reliability. We show you the AllSides political leaning ratingsof each outlet. The database features bias ratings from most large U.S. outlets but lacks information 
					from outlets outside the U.S. and smaller outlets.
				</p>
			</div>
			<div class="method-block">
				<p class="method-title"><IconBrain size={16} stroke={1.75} color="var(--text-secondary)" />Local AI score</p>
				<p class="method-body">
					A small language model runs entirely on your device to flag loaded language, framing bias, and other signs of bias.
					 Nothing you paste in is sent to a server for this step.
				</p>
			</div>
			<div class="method-block">
				<p class="method-title"><IconAlertTriangle size={16} stroke={1.75} color="var(--text-secondary)" />Limitations</p>
				<p class="method-body">
					These signals are not a final judgment of truth or falsehood. The AI model can make mistakes as it is a quantizied version of the orginal model, which allows it to run on your device. The ai model model can be found <a href="https://huggingface.co/protectai/distilroberta-bias-onnx">here</a>.
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

	.search-row button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.progress-row {
		margin-bottom: 1.5rem;
	}

	.progress-bar {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-1);
		border: 0.5px solid var(--border);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--text-accent);
		border-radius: 999px;
		transition: width 0.2s ease;
	}

	.progress-label {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--text-muted);
	}

	.extract-box {
		margin-bottom: 1.5rem;
	}

	.extract-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
		margin: 0 0 6px;
		display: flex;
		align-items: center;
	}

	.extract-box textarea {
		width: 100%;
		box-sizing: border-box;
		border-radius: var(--radius);
		border: 0.5px solid var(--border-strong);
		background: var(--surface-2);
		padding: 10px 12px;
		font-family: var(--font-sans);
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-primary);
		resize: vertical;
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

	.badge.biased {
		background: #dc2626;
		color: #ffffff;
		font-weight: 600;
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

	.lean-badge {
		display: inline-block;
		padding: 2px 12px;
		border-radius: 999px;
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 600;
		color: #fff;
		white-space: nowrap;
	}

	.lean-badge.lean-left {
		background: #1e40af; /* dark blue — strong left */
	}

	.lean-badge.lean-left-center {
		background: #5b8def; /* light blue — left-leaning */
	}

	.lean-badge.lean-center {
		background: #8a8a8a; /* grey — center / neutral */
	}

	.lean-badge.lean-right-center {
		background: #ef7b7b; /* light red — right-leaning */
	}

	.lean-badge.lean-right {
		background: #b91c1c; /* dark red — strong right */
	}

	.lean-badge.lean-unknown {
		background: #b0b0b0; /* grey — unknown */
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

	.scraper-note {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		background: var(--bg-moderate);
		border-radius: var(--radius);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-moderate);
	}

	.error-card {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--bg-strong);
		border-color: #f5c6cb;
	}

	.error-card p {
		font-size: 13px;
		color: var(--text-strong);
		margin: 0;
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