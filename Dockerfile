FROM python:3.13-slim
WORKDIR /app
COPY agent ./agent
COPY web ./web
COPY tests ./tests
COPY extension ./extension
ENV PYTHONUNBUFFERED=1 OPPORTUNITY_HOST=0.0.0.0 OPPORTUNITY_DATA_DIR=/data
RUN useradd --uid 10001 --create-home appuser && mkdir /data && chown appuser:appuser /data
USER appuser
EXPOSE 8765
CMD ["python", "-m", "agent"]
