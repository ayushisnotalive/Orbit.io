import type { FC } from 'hono/jsx';

interface SnippetGeneratorProps {
  pingUrl: string;
  uuid: string;
}

export const SnippetGenerator: FC<SnippetGeneratorProps> = ({ pingUrl, uuid }) => {
  const snippets = {
    cron: `* * * * * /path/to/job.sh && curl -fsS -m 10 --retry 3 "${pingUrl}" > /dev/null`,
    bash: `#!/usr/bin/env bash
# Dead-man's switch wrapper: reports start and exit status
curl -fsS -m 10 --retry 3 "${pingUrl}/start"
if /path/to/your-command.sh; then
  curl -fsS -m 10 --retry 3 "${pingUrl}"
else
  curl -fsS -m 10 --retry 3 "${pingUrl}/fail"
  exit 1
fi`,
    cli: `# Execute with OrbitPing wrapper CLI
orbitping run ${uuid} -- /path/to/your-command.sh`,
    python: `import urllib.request

try:
    # Your scheduled task execution
    execute_scheduled_task()
    urllib.request.urlopen("${pingUrl}", timeout=10)
except Exception as e:
    urllib.request.urlopen("${pingUrl}/fail", timeout=10)
    raise`,
    node: `// Node.js native fetch (Node 18+)
try {
  await runScheduledJob();
  await fetch("${pingUrl}");
} catch (err) {
  await fetch("${pingUrl}/fail").catch(() => {});
  throw err;
}`,
    php: `<?php
try {
    runScheduledTask();
    file_get_contents("${pingUrl}");
} catch (Throwable $e) {
    file_get_contents("${pingUrl}/fail");
    throw $e;
}`,
    github: `- name: OrbitPing Heartbeat
  if: always()
  run: |
    if [ "\${{ job.status }}" = "success" ]; then
      curl -fsS -m 10 --retry 3 "${pingUrl}"
    else
      curl -fsS -m 10 --retry 3 "${pingUrl}/fail"
    fi`,
  };

  return (
    <div class="card" style="margin-top: 1.5rem;">
      <div class="card-header">
        <h3 class="card-title">Integration Code Snippets</h3>
        <span style="font-size: 0.8125rem; color: var(--text-muted);">Select language or environment</span>
      </div>

      <div class="code-box">
        <div class="code-header">
          <div class="code-tabs">
            <button
              type="button"
              class="code-tab-btn active"
              onclick="showTab(event, 'tab-cron')"
            >
              Cron
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-bash')"
            >
              Bash
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-cli')"
            >
              CLI
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-python')"
            >
              Python
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-node')"
            >
              Node.js
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-php')"
            >
              PHP
            </button>
            <button
              type="button"
              class="code-tab-btn"
              onclick="showTab(event, 'tab-github')"
            >
              GitHub Actions
            </button>
          </div>
          <button
            type="button"
            class="copy-btn"
            id="copy-snippet-btn"
            onclick="copyActiveTabContent(this)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy Snippet</span>
          </button>
        </div>

        <div id="tab-cron" class="tab-pane active">
          <pre class="code-content"><code>{snippets.cron}</code></pre>
        </div>
        <div id="tab-bash" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.bash}</code></pre>
        </div>
        <div id="tab-cli" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.cli}</code></pre>
        </div>
        <div id="tab-python" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.python}</code></pre>
        </div>
        <div id="tab-node" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.node}</code></pre>
        </div>
        <div id="tab-php" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.php}</code></pre>
        </div>
        <div id="tab-github" class="tab-pane" style="display: none;">
          <pre class="code-content"><code>{snippets.github}</code></pre>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            function showTab(evt, tabId) {
              document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
              document.querySelectorAll('.code-tab-btn').forEach(el => el.classList.remove('active'));
              document.getElementById(tabId).style.display = 'block';
              evt.currentTarget.classList.add('active');
            }

            function copyActiveTabContent(btn) {
              const activeTab = document.querySelector('.tab-pane[style*="display: block"]') || document.getElementById('tab-cron');
              if (activeTab) {
                const code = activeTab.innerText.trim();
                copyToClipboard(code, btn);
              }
            }
          `,
        }}
      />
    </div>
  );
};
