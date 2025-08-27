FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY ../shared/requirements.txt /app/shared_requirements.txt
RUN pip install -r shared_requirements.txt

# Copy shared code
COPY ../shared /app/shared
ENV PYTHONPATH="/app:${PYTHONPATH}"

# Copy service code
COPY . /app/

EXPOSE 8000

CMD ["python", "main.py"]
