FROM python:3.11-slim
WORKDIR /app
COPY . /app/services/voice
RUN pip install -e /app/services/voice
CMD ["python", "services/voice/agent.py"]
