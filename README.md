# Veritape — Deepfake Voice Detection

Upload a voice recording and Veritape tells you whether it sounds **REAL** or
**AI-generated (FAKE)**, with calibrated probabilities and timing details.

The project has two parts:

- **Backend** — FastAPI + PyTorch serving an AASIST anti-spoofing model trained
  on ASVspoof 2019 LA. Handles decoding, resampling and inference.
- **Frontend** — Next.js 15 + Tailwind CSS 4 dashboard with drag & drop upload,
  waveform preview, progress states and a verdict card.

> The verdict is evidence, not proof. Heavy compression, music beds, noise,
> multiple speakers or short clips can shift the score.

---

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Python | 3.10+ (3.11 recommended) | backend |
| Node.js | 18.18+ (20+ recommended) | frontend |
| npm | ships with Node | frontend |
| ffmpeg | optional, on `PATH` | AAC/M4A decoding |

The model checkpoint is already included at
`backend/model/final_aasist_weights.pth`; no download step is required.

---

## Quick start

Run each part in its own terminal. Start the backend first, then the frontend.

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment (recommended)
python -m venv venv
venv/Scripts/activate          # Windows (Git Bash / PowerShell)
# source venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Start the API
python run.py                  # http://127.0.0.1:8000
```

Alternative (same result, without `run.py`):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Interactive API docs: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/api/health>

### 2. Frontend

In a second terminal:

```bash
cd frontend

npm install
npm run dev                    # http://localhost:3000
```

The UI defaults to `http://localhost:8000` for the API. To point it elsewhere:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Production build:

```bash
cd frontend
npm run build
npm run start                  # http://localhost:3000
```

Useful frontend scripts: `npm run dev`, `npm run build`, `npm run start`,
`npm run lint`, `npm run typecheck`.

---

## Project structure

```
backend/                    FastAPI service + AASIST model
  app/
    main.py                 FastAPI app, routes, error handling, CORS
    config.py               settings and file paths
    audio.py                validation, decode, resample, crop/tile
    detector.py             model loading + thread-safe inference
    schemas.py              request/response models
  models/AASIST.py          model architecture
  model/
    model_config.json       architecture, audio contract, classes
    final_aasist_weights.pth  trained checkpoint
  config/                   reference model configs (.conf)
  run.py                    dev entrypoint
  requirements.txt

frontend/                   Next.js app (App Router)
  app/                      layout, page, global theme
  components/               analyzer, waveform, verdict card, gauge, status
  lib/                      API client, types, formatters
  .env.example              NEXT_PUBLIC_API_URL template
```

---

## How it works

1. The UI validates file type and size, previews the audio locally, then sends a
   multipart `file` upload to `POST /api/analyze`.
2. The API validates extension, MIME type and size.
3. Audio is decoded (`soundfile` → `librosa`/temp file → stdlib `wave` fallback),
   downmixed to mono and resampled to **16 kHz**.
4. Long clips are center-cropped; short clips are repeat-tiled to exactly
   **64,600 samples** (~4 s at 16 kHz).
5. The waveform goes through AASIST and a softmax over `FAKE=0`, `REAL=1`.
6. The result is returned with probabilities, logits, audio metadata and model
   info, and rendered as a REAL/FAKE verdict with a confidence gauge.

Inference runs in a worker thread behind a lock, so the event loop stays
responsive and the model is never called concurrently. Clips are processed in
memory and are not written to disk by the API.

### Audio formats

WAV, MP3, OGG/OPUS and FLAC decode with `libsndfile`. **AAC/M4A** needs
`ffmpeg` available on `PATH`.

---

## Model and training

| | |
| --- | --- |
| **Model** | AASIST — graph-attention anti-spoofing network (RawNet2-style sinc front-end + heterogeneous stacking graph attention layers) |
| **Dataset** | [ASVspoof 2019 LA](https://www.asvspoof.org/) (`Bisher/ASVspoof_2019_LA`) — bonafide vs. spoofed (TTS/VC) speech |
| **Input** | 16 kHz mono, 64,600 samples (~4 s) |
| **Classes** | `FAKE = 0`, `REAL = 1` |
| **Checkpoint** | `backend/model/final_aasist_weights.pth` |

### Training setup

| Setting | Value |
| --- | --- |
| Optimizer | Adam |
| Learning rate | `1e-4`, cosine annealing |
| Weight decay | `1e-4` |
| Batch size | 8 |
| Epochs | 5 |
| Augmentation | Noise applied with probability 0.6 at SNR levels 20, 15, 10, 5, 0 dB |

### Development-set results

Evaluated on the ASVspoof 2019 LA **development set**, both clean and with the
noise augmentation applied. These are development numbers, not a held-out test
or independent-dataset evaluation.

| Condition | Loss | Accuracy | Precision | Recall | F1 | AUC | EER |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clean | 0.1145 | 95.58% | 71.80% | 93.64% | 81.28% | 98.79% | **5.27%** |
| Noisy | 0.1917 | 91.91% | 56.82% | 87.99% | 69.05% | 96.60% | **9.62%** |

Precision is noticeably lower than recall and the dev set is class-imbalanced,
so accuracy alone is misleading — EER and AUC are the better summaries, and
EER roughly doubles once noise augmentation is applied.

### Per-epoch history

| Epoch | Train loss | Clean loss | Clean acc | Clean F1 | Clean AUC | Clean EER | Noisy loss | Noisy acc | Noisy F1 | Noisy AUC | Noisy EER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6614 | 0.3878 | 82.60% | 51.34% | 92.53% | 14.66% | 0.4315 | 80.31% | 42.90% | 84.85% | 23.23% |
| 2 | 0.4307 | 0.4492 | 77.71% | 47.62% | 96.76% | 9.34% | 0.6492 | 63.36% | 35.13% | 92.06% | 15.90% |
| 3 | 0.3388 | 0.2737 | 87.35% | 61.45% | 98.31% | 6.51% | 0.3704 | 81.84% | 51.12% | 94.90% | 12.91% |
| 4 | 0.2791 | 0.1625 | 93.07% | 73.84% | 98.70% | 5.81% | 0.2202 | 90.44% | 65.63% | 96.46% | 10.17% |
| 5 | 0.2492 | 0.1145 | 95.58% | 81.28% | 98.79% | 5.27% | 0.1919 | 91.87% | 68.89% | 96.66% | 9.68% |

---

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Service metadata |
| `GET` | `/api/health` | Status, model availability, device, uptime |
| `GET` | `/api/model` | Architecture, classes, audio contract, limits |
| `POST` | `/api/analyze` | Multipart `file` → prediction JSON |

```bash
curl -F "file=@sample.wav" http://127.0.0.1:8000/api/analyze
```

```json
{
  "prediction": "FAKE",
  "verified": false,
  "confidence": 0.999792,
  "probabilities": { "fake": 0.999792, "real": 0.000208 },
  "logits": [3.038594, -5.436975],
  "audio": {
    "filename": "sample.wav",
    "format": "WAV",
    "original_sample_rate": 44100,
    "original_channels": 2,
    "sample_rate": 16000,
    "channels": 1,
    "duration_seconds": 3.0,
    "samples": 64600,
    "padded_or_cropped": true,
    "processing_ms": 912.4
  },
  "model": { "name": "AASIST", "device": "cpu", "...": "..." },
  "analyzed_at": "2026-11-06T08:30:56+00:00"
}
```

Errors always have the shape `{ "code", "message", "detail" }`:

| Status | Code | When |
| --- | --- | --- |
| 415 | `unsupported_format` | Unknown extension / undecodable file |
| 413 | `audio_too_long` | File over the size cap or longer than max duration |
| 422 | `audio_too_short`, `silent_audio`, `invalid_audio` | Unusable content |
| 503 | `model_unavailable` | Checkpoint missing or architecture mismatch |

---

## Backend configuration

All environment variables are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Bind address |
| `RELOAD` | `false` | Auto-reload for `python run.py` |
| `LOG_LEVEL` | `info` | Uvicorn log level |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact CORS origins |
| `ALLOW_ORIGIN_REGEX` | localhost on any port | CORS regex fallback |
| `MAX_UPLOAD_BYTES` | `26214400` (25 MB) | Upload cap |
| `MIN_DURATION_SECONDS` / `MAX_DURATION_SECONDS` | `0.25` / `600` | Accepted clip length |
| `TORCH_THREADS` | auto | CPU inference threads |
| `DEBUG` | `false` | Expose decoder internals in errors |

---

## Frontend features

- Drag & drop or browse; validates type and size client-side
- Local preview with waveform, play/pause, click-to-seek and duration
- Analyze button with staged progress (decode → resample → inference → softmax)
- Verdict card: REAL/FAKE, confidence gauge, probability bars, timing and model
  metadata
- Clear/reset, cancel in-flight analysis, inline errors with retry copy
- Responsive single-column layout on mobile, two-column dashboard on desktop

---

## Troubleshooting

- **`503 model_unavailable` / health says `degraded`** — make sure
  `backend/model/final_aasist_weights.pth` and `model_config.json` exist and
  match the architecture in `model_config.json`.
- **Frontend shows “Could not reach the detection server”** — the backend is not
  running, or `NEXT_PUBLIC_API_URL` points at the wrong host/port. Restart
  `npm run dev` after changing the env file.
- **CORS errors in the browser** — add the exact frontend origin to
  `ALLOWED_ORIGINS` (e.g. `http://localhost:3001` if the dev server picked
  another port).
- **M4A/AAC upload rejected** — install `ffmpeg` and make sure it is on `PATH`.
- **Slow first analysis** — the first request after startup warms up the model;
  later requests are faster.
