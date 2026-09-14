FROM python:3.11-slim

WORKDIR /app

# Manim's Tex/MathTex compile step shells out to `latex`/`dvisvgm`. Without a
# TeX install EVERY render using math text fails deterministically, and each
# retry burns Azure tokens — so a minimal TeX is baked into the image.
# Indic fonts: Manim Text renders non-English labels (Hindi, Punjabi, Bengali,
# …) through Pango system fonts. The slim base image only ships DejaVu, so
# Gurmukhi/Devanagari render as white tofu boxes. fonts-indic (all Lohit
# Indian-script fonts) + fonts-noto-core cover every supported language.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    gcc \
    g++ \
    git \
    curl \
    libcairo2-dev \
    pkg-config \
    cmake \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    texlive-latex-base \
    texlive-latex-recommended \
    dvisvgm \
    cm-super \
    fonts-indic \
    fonts-noto-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create writable outputs directory
RUN useradd -m appuser && \
    mkdir -p /app/outputs && \
    chown -R appuser:appuser /app

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/app

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
