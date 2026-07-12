# Lustre OPS ImageGen Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate and integrate three restrained Lustre-specific empty-state visuals for healthy logs, an empty knowledge base, and a completed inspection with no findings.

**Architecture:** Store optimized project-bound assets under `app/public/visuals/`. Add one reusable React component that renders a stable-size image and falls back to an existing Lucide icon when loading fails. Existing backend-derived conditions remain the only source of truth for whether an empty state is shown.

**Tech Stack:** Built-in ImageGen, PNG/WebP post-processing, React 19, TypeScript, Tailwind CSS, Playwright, rsync, systemd.

## Global Constraints

- Do not place generated visuals on monitoring dashboards, alert lists, or metric cards.
- Do not replace Lucide navigation, button, or status icons.
- No text, logos, watermarks, people, decorative orbs, or exaggerated 3D scenes in generated images.
- Keep rendered visual height between 96px and 120px.
- Preserve loading, error, normal-data, and abnormal-data behavior.
- No new runtime dependency and no frontend API key.
- Do not create a Git commit or synchronize GitHub before user acceptance.

---

### Task 1: Generate and optimize three visual assets

**Files:**
- Create: `app/public/visuals/lustre-logs-healthy.webp`
- Create: `app/public/visuals/lustre-knowledge-empty.webp`
- Create: `app/public/visuals/lustre-inspection-clear.webp`

**Interfaces:**
- Produces: three static WebP files addressable as `${import.meta.env.BASE_URL}visuals/lustre-logs-healthy.webp`, `${import.meta.env.BASE_URL}visuals/lustre-knowledge-empty.webp`, and `${import.meta.env.BASE_URL}visuals/lustre-inspection-clear.webp`.

- [x] **Step 1: Generate each source image with the built-in ImageGen tool**

Use one generation call per asset. Each prompt must request a centered opaque technical illustration on a flat `#ff00ff` chroma-key background, no text, no watermark, and the approved deep-blue/cyan/green palette.

- [x] **Step 2: Copy generated PNG files into a workspace staging directory**

Immediately after each ImageGen call, use the exact returned image path as the source for one of these commands:

```bash
mkdir -p app/public/visuals app/tmp/imagegen
cp "$IMAGEGEN_LOG_RESULT" app/tmp/imagegen/lustre-logs-healthy-source.png
cp "$IMAGEGEN_KNOWLEDGE_RESULT" app/tmp/imagegen/lustre-knowledge-empty-source.png
cp "$IMAGEGEN_INSPECTION_RESULT" app/tmp/imagegen/lustre-inspection-clear-source.png
```

`IMAGEGEN_LOG_RESULT`, `IMAGEGEN_KNOWLEDGE_RESULT`, and `IMAGEGEN_INSPECTION_RESULT` are shell variables assigned to the three absolute paths returned by the preceding built-in generation calls.

- [x] **Step 3: Remove the chroma key and create transparent PNGs**

Run the installed helper for each source:

```bash
python "$HOME/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input app/tmp/imagegen/lustre-logs-healthy-source.png \
  --out app/tmp/imagegen/lustre-logs-healthy.png \
  --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Repeat with the knowledge and inspection filenames.

- [x] **Step 4: Convert the transparent PNGs to WebP**

Use the bundled workspace image runtime or available ImageMagick command to resize within `640x400`, preserve alpha, and write quality-82 WebP files under `app/public/visuals/`.

- [x] **Step 5: Validate generated assets**

Verify each image has transparent corners, no magenta fringe, no text/watermark, correct Lustre-specific subject matter, and a file size below 250 KB.

---

### Task 2: Add a reusable generated empty-state visual

**Files:**
- Create: `app/src/components/GeneratedEmptyStateVisual.tsx`
- Test: `/tmp/lustre-imagegen-empty-states.mjs`

**Interfaces:**
- Produces: `GeneratedEmptyStateVisual({ src, alt, fallbackIcon, className })`.
- The component resolves `src` through `import.meta.env.BASE_URL`, renders a fixed `h-24 sm:h-[120px]` image, and renders the supplied Lucide fallback after `onError`.

- [x] **Step 1: Write a failing browser check**

The temporary Playwright check must assert that the three current empty states do not yet contain:

```text
img[alt="Lustre 日志采集正常"]
img[alt="Lustre 知识库等待内容"]
img[alt="Lustre 集群巡检通过"]
```

- [x] **Step 2: Run the browser check and confirm failure**

Run against the current test deployment through SSH port forwarding. Expected result: at least the healthy-log selector is absent.

- [x] **Step 3: Implement the component**

Required behavior:

```tsx
export function GeneratedEmptyStateVisual({ src, alt, fallbackIcon: FallbackIcon, className }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) return <FallbackIcon aria-hidden="true" className="h-8 w-8 text-emerald-500" />
  return <img src={`${import.meta.env.BASE_URL}${src}`} alt={alt} onError={() => setFailed(true)} className={cn('h-24 w-auto max-w-full object-contain sm:h-[120px]', className)} />
}
```

- [x] **Step 4: Run ESLint on the component**

Run: `npx eslint src/components/GeneratedEmptyStateVisual.tsx`
Expected: exit code 0.

---

### Task 3: Integrate visuals into real empty-state conditions

**Files:**
- Modify: `app/src/pages/LogAnalysis.tsx:1197-1203`
- Modify: `app/src/pages/LogAnalysis.tsx:1466-1478`
- Modify: `app/src/pages/HealthCheck.tsx:1046-1053`
- Test: `/tmp/lustre-imagegen-empty-states.mjs`

**Interfaces:**
- Consumes: `GeneratedEmptyStateVisual` and three `/visuals/*.webp` assets.

- [x] **Step 1: Integrate the knowledge-base visual**

Render `lustre-knowledge-empty.webp` only after loading succeeds and both `cases` and `documents` are empty. Keep upload, refresh, reindex, close, loading, and error controls unchanged.

- [x] **Step 2: Integrate the healthy-log visual**

When `filteredLogs.length === 0` and `logView === 'attention'`, render `lustre-logs-healthy.webp`. For the all-log search empty state, retain the existing Lucide search/empty presentation.

- [x] **Step 3: Integrate the inspection-clear visual**

When `healthData.findings.length === 0`, render `lustre-inspection-clear.webp` with the Chinese title `本次巡检未发现异常` and a concise scope-qualified description. When findings exist, render the existing rows unchanged.

- [x] **Step 4: Run related lint and build checks**

Run:

```bash
npx eslint src/components/GeneratedEmptyStateVisual.tsx src/pages/LogAnalysis.tsx src/pages/HealthCheck.tsx
npm run build
```

Expected: both commands exit 0; an existing bundle-size warning is acceptable.

---

### Task 4: Deploy and verify on the test server

**Files:**
- Deploy source: `app/`
- Deploy target: the test environment application directory.

**Interfaces:**
- Produces: the test environment `/lustre-ops/` URL with all three assets bundled and served.

- [x] **Step 1: Create a rollback snapshot**

Set `stamp=$(date +%Y%m%d-%H%M%S)`, create `/opt/Lustre_OPS/backups/$stamp/`, and copy the current `dist`, `src/pages/LogAnalysis.tsx`, `src/pages/HealthCheck.tsx`, and `src/components/` into that directory.

- [x] **Step 2: Synchronize and build**

Use password-authenticated rsync excluding `node_modules`, `dist`, and `.git`, then run `npm run build` remotely.

- [x] **Step 3: Verify static assets and service health**

Check all three `/lustre-ops/visuals/*.webp` URLs return HTTP 200 with `image/webp`. Confirm `lustre-ops-api.service` remains active.

- [x] **Step 4: Run browser acceptance**

Through SSH port forwarding, validate 1920×1080, 1440×900, and a narrow viewport. Check:

- healthy-log visual appears only in the attention empty state;
- all-log search empty state does not show a health image;
- the current non-empty knowledge base does not show its empty image;
- the inspection image appears only when findings are empty;
- missing-image simulation exposes the Lucide fallback without layout shift;
- console errors and failed responses are empty;
- existing refresh, filter, knowledge-base, inspection, close, and retry controls still work.

- [x] **Step 5: Record deployment state**

Report the backup path, build/test results, access URL, asset prompts and paths, remaining limitations, and `GitHub 同步状态：未同步`.
