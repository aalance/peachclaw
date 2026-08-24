# MOSS-TTS-Nano (external voice service)

The desktop pet's voice comes from [OpenMOSS/MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano),
which runs as a **separate local HTTP server** — it is *not* bundled in this repo.
Without it the pet still launches and works; it just stays silent.

The client expects the server on `http://127.0.0.1:18083` (see
`src/shared/tts/constants.ts`, `MOSS_DEFAULT_BASE_URL`).

## Setup

Pinned to upstream commit `cc7bdf1`. Clone it as a **sibling** of this repo:

```bash
cd ..                                                        # parent of LobsterAI
git clone https://github.com/OpenMOSS/MOSS-TTS-Nano.git
cd MOSS-TTS-Nano
git checkout cc7bdf1
git apply ../LobsterAI/third_party/moss-tts-nano/gpu-device.patch
```

### Why the patch

Upstream ships `app.py` as a CPU-only demo: it ignores `--device` and pins the
synthesis endpoint to the dedicated CPU runtime. The patch (8 lines, 2 hunks)
honours the flag so `--device auto` actually uses CUDA when a GPU is present.
CPU-only machines can skip it — everything works, just slower.

### Python environment

Requires **Python 3.12**. Two known install traps on Windows:

1. `pynini` / `WeTextProcessing` have no pip wheel on Windows. Install via conda
   first: `conda install -c conda-forge pynini=2.1.7`, then pip-install the rest.
2. `requirements.txt` pins `torch==2.7.0` (CPU build), which overwrites a CUDA
   torch. Install CUDA torch first
   (`pip install torch==2.7.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu126`),
   then install the remaining requirements with the `torch` line removed.

Model weights (`OpenMOSS-Team/MOSS-TTS-Nano` + `MOSS-Audio-Tokenizer-Nano`) are
downloaded from HuggingFace on first run — they are not stored in either repo.

> **Windows long paths:** with `LongPathsEnabled=0`, the nested `trust_remote_code`
> cache path exceeds 260 characters and warmup fails with `WinError 206`. Fix by
> setting `LongPathsEnabled=1` under
> `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem` (needs admin), then reboot.

## Running

```bash
python app.py --host 127.0.0.1 --port 18083 --device auto
```

Start it before (or alongside) `npm run pet`. `GET /health` is the readiness probe.

## API shape

Not OpenAI-compatible — do not expect `/v1/audio/speech`:

- `POST /api/generate`, `multipart/form-data`, fields `text` + `demo_id`
- returns JSON `{ audio_base64, sample_rate, ... }`
- reference voices are preset ids `demo-1` … `demo-29`, defined server-side in
  `assets/demo.jsonl`

## License

MOSS-TTS-Nano is Apache 2.0. Only the patch above lives in this repo; the source
is cloned from upstream.
