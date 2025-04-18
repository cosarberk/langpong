#!/bin/bash

# HATA YÖNETİMİ
set -e

# Kullanıcı adını buraya yaz, ya da env'den al
DOCKER_USER="relteco"

# Versiyonu package.json'dan çek
VERSION=$(node -p "require('./package.json').version")

# Image isimleri
IMAGE_NAME="langpong"
FULL_IMAGE_VERSION="$DOCKER_USER/$IMAGE_NAME:$VERSION"
FULL_IMAGE_LATEST="$DOCKER_USER/$IMAGE_NAME:latest"

echo "📦 Version: $VERSION"
echo "🐳 Building Docker image..."

docker build -t $IMAGE_NAME .

echo "🏷️ Tagging image as:"
echo "  - $FULL_IMAGE_VERSION"
echo "  - $FULL_IMAGE_LATEST"

docker tag $IMAGE_NAME $FULL_IMAGE_VERSION
docker tag $IMAGE_NAME $FULL_IMAGE_LATEST

echo "📤 Pushing to Docker Hub..."
docker push $FULL_IMAGE_VERSION
docker push $FULL_IMAGE_LATEST

echo "✅ Done. Image published as:"
echo " - $FULL_IMAGE_VERSION"
echo " - $FULL_IMAGE_LATEST"