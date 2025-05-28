from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Serve the public directory at root "/"
app.mount("/", StaticFiles(directory="public", html=True), name="public")
