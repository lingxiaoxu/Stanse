# Cloud Run Traffic Routing Guide

**Date**: 2026-02-07
**Category**: DevOps / Deployment
**Tags**: Cloud Run, Cloud Build, Traffic Management

## Problem Description

When deploying new revisions to Cloud Run via Cloud Build, sometimes the new revision is deployed but **traffic is not automatically routed** to it. This results in the old revision continuing to serve 100% of traffic while the new revision serves 0%.

### Symptoms

1. Cloud Build shows successful deployment:
   ```
   Service [stanse] revision [stanse-00393-dxz] has been deployed and is serving 0 percent of traffic.
   ```

2. Checking Cloud Run traffic shows old revision:
   ```bash
   gcloud run services describe stanse --region=us-central1 --format="value(status.traffic)"
   # Output: {'percent': 100, 'revisionName': 'stanse-00392-7rl'}
   ```

3. New code changes are not reflected in production even after "successful" deployment.

## Root Cause

Cloud Run's traffic routing behavior depends on several factors:

1. **No `--tag` flag**: When deploying without explicit traffic routing instructions, Cloud Run may not automatically switch traffic.

2. **Revision tagging**: If the service is configured with revision tags, new deployments may need explicit traffic updates.

3. **Gradual rollout settings**: Some services may be configured for gradual rollouts instead of immediate traffic switching.

## Solution

### Option 1: Manual Traffic Update (Immediate Fix)

After deployment, manually route all traffic to the latest revision:

```bash
gcloud run services update-traffic stanse \
  --to-latest \
  --region=us-central1 \
  --project=gen-lang-client-0960644135
```

### Option 2: Update cloudbuild.yaml (Permanent Fix)

Modify your `cloudbuild.yaml` to include the `--tag` flag with `latest` or add a separate traffic update step:

```yaml
# Option A: Add --tag latest to deploy command
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: gcloud
  args:
    - 'run'
    - 'deploy'
    - 'stanse'
    - '--image'
    - 'gcr.io/$PROJECT_ID/stanse:latest'
    - '--region'
    - 'us-central1'
    - '--allow-unauthenticated'
    - '--tag'
    - 'latest'

# Option B: Add separate traffic update step after deploy
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  entrypoint: gcloud
  args:
    - 'run'
    - 'services'
    - 'update-traffic'
    - 'stanse'
    - '--to-latest'
    - '--region'
    - 'us-central1'
```

## Verification Commands

### Check Current Traffic Distribution

```bash
gcloud run services describe stanse \
  --region=us-central1 \
  --format="value(status.traffic)" \
  --project=gen-lang-client-0960644135
```

**Expected Output (after fix)**:
```
{'latestRevision': True, 'percent': 100, 'revisionName': 'stanse-00396-s9l'}
```

### List All Revisions

```bash
gcloud run revisions list \
  --service=stanse \
  --region=us-central1 \
  --project=gen-lang-client-0960644135
```

### Route Traffic to Specific Revision

```bash
gcloud run services update-traffic stanse \
  --to-revisions=stanse-00396-s9l=100 \
  --region=us-central1 \
  --project=gen-lang-client-0960644135
```

## Best Practices

1. **Always verify deployment**: After Cloud Build completes, verify traffic is on the new revision.

2. **Add traffic update to CI/CD**: Include `update-traffic --to-latest` as a post-deployment step.

3. **Monitor deployment logs**: Watch for the "serving X percent of traffic" message in Cloud Build logs.

4. **Use tags for rollback**: Tag important revisions so you can easily roll back if needed:
   ```bash
   gcloud run services update-traffic stanse \
     --set-tags=stable=REVISION_NAME \
     --region=us-central1
   ```

## Related Documentation

- [Cloud Run Traffic Management](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Cloud Build with Cloud Run](https://cloud.google.com/build/docs/deploying-builds/deploy-cloud-run)
