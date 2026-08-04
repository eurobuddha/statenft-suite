#!/bin/bash
# Mint the collection described in collection.json (thin wrapper around mint.py).
# Usage: ./02-mint.sh [collection.json]
cd "$(dirname "$0")"
exec python3 mint.py "${1:-collection.json}"
