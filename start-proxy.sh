#!/bin/bash

# Helper script to start the Are.na OAuth proxy server

echo "=========================================="
echo "Are.na OAuth Proxy Server"
echo "=========================================="
echo ""

# Check if CLIENT_SECRET is provided
if [ -z "$1" ]; then
    echo "Usage: ./start-proxy.sh YOUR_CLIENT_SECRET"
    echo ""
    echo "To get your Client Secret:"
    echo "1. Go to https://www.are.na/settings/applications"
    echo "2. Find your OAuth application"
    echo "3. Copy the Client Secret"
    echo ""
    echo "Then run: ./start-proxy.sh YOUR_CLIENT_SECRET"
    exit 1
fi

CLIENT_SECRET=$1

echo "Starting proxy server..."
echo "Server will run on: http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""

CLIENT_SECRET=$CLIENT_SECRET node proxy-server.js
