# Use the official lightweight NGINX image
FROM nginx:alpine

# Copy static website files from the public directory
COPY ./public/ /usr/share/nginx/html/

# Expose port 80 for HTTP
EXPOSE 80

# Keep NGINX running in the foreground
CMD ["nginx", "-g", "daemon off;"]
