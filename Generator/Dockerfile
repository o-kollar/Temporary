FROM registry.access.redhat.com/ubi8/python-311

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app code
COPY . .

# Expose the default FastAPI port
EXPOSE 8000

# Run the app
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
