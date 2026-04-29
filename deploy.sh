#!/bin/bash
set -e

echo "Deploying ESPN Soccer MCP Server to OpenShift..."

# Create ConfigMap from server.ts
echo "Creating ConfigMap..."
oc create configmap espn-soccer-server \
  --from-file=server.ts=server.ts \
  -n n8n \
  --dry-run=client -o yaml | oc apply -f -

# Apply Kubernetes resources
echo "Creating ImageStream..."
oc apply -f k8s/imagestream.yaml

echo "Creating BuildConfig..."
oc apply -f k8s/buildconfig.yaml

echo "Starting build..."
oc start-build espn-soccer -n n8n --follow

echo "Creating Service..."
oc apply -f k8s/service.yaml

echo "Creating Deployment..."
oc apply -f k8s/deployment.yaml

echo "Creating Route..."
oc apply -f k8s/route.yaml

echo ""
echo "Deployment complete!"
echo ""
echo "Getting route URL..."
ROUTE=$(oc get route espn-soccer -n n8n -o jsonpath='{.spec.host}')
echo "ESPN Soccer MCP Server URL: https://${ROUTE}/mcp"
echo ""
echo "Test with:"
echo "curl -sk https://${ROUTE}/health | jq ."
