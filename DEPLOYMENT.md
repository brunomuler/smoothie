# Deploying Smoothie to Netlify

This guide walks you through deploying the Smoothie application to Netlify.

## Prerequisites

1. A [Netlify account](https://app.netlify.com/signup)
2. Access to the Neon DB connection string
3. The smoothie repository pushed to GitHub/GitLab/Bitbucket

## Deployment Steps

### 1. Fix Build Errors First

Before deploying, you need to fix the MUI dependencies issue in `blend-ui-main` folder:

```bash
# Option 1: Remove the blend-ui-main folder if not needed
rm -rf blend-ui-main

# Option 2: Install the missing dependencies
npm install @mui/icons-material @mui/material
```

### 2. Connect Repository to Netlify

1. Log in to [Netlify](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Choose your Git provider (GitHub/GitLab/Bitbucket)
4. Select the `smoothie` repository
5. Configure the build settings:
   - **Base directory**: `smoothie` (if in monorepo)
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`

### 3. Configure Environment Variables

In the Netlify dashboard:

1. Go to **Site settings** → **Environment variables**
2. Add the following variable:

   ```
   Key: DATABASE_URL
   Value: postgresql://your_user:your_password@your-project-pooler.region.aws.neon.tech/your_database?sslmode=require
   ```

   Replace the placeholder with your actual Neon database connection string from your Neon dashboard.

   ⚠️ **Security Note**: Make sure to use Neon's connection pooler URL (contains `-pooler` in hostname) for serverless deployments.

### 4. Deploy

1. Click "Deploy site"
2. Netlify will build and deploy your application
3. Once complete, you'll get a URL like `https://your-app-name.netlify.app`

## Post-Deployment

### Test the Deployment

Test the API endpoint:
```bash
curl "https://your-app-name.netlify.app/api/balance-history?user=GBZUE4C27CKHVKPTV7FQT3KFZY3ZGXPWQ5XFQZO6IIU7DCOHSOMWWV34&asset=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC&days=7"
```

### Monitor Function Logs

1. Go to **Functions** tab in Netlify dashboard
2. Check logs for any errors or warnings
3. Monitor database connection usage

## Troubleshooting

### Database Connection Issues

If you see "too many connections" errors:

1. Verify you're using Neon's pooler URL (contains `-pooler`)
2. Check if multiple deployments are running simultaneously
3. Consider using Neon's autoscaling feature

### Build Failures

1. Check the build logs in Netlify
2. Ensure all dependencies are installed
3. Verify TypeScript types are correct

### API Route Timeouts

1. Increase function timeout in `netlify.toml`
2. Optimize database queries
3. Add appropriate indexes to database tables

## Serverless Considerations

### Database Connections

- Each serverless function instance creates its own database connection
- The connection pool is configured with `max: 1` to minimize connections
- Neon's connection pooler helps manage multiple connections efficiently

### Cold Starts

- First request after inactivity may be slower (cold start)
- Subsequent requests will be faster (warm start)
- Consider using Netlify's "Keep functions warm" feature for critical routes

### Function Limits

- Default timeout: 10 seconds (configured in `netlify.toml`)
- Memory: 1024 MB (Netlify default)
- Concurrent executions: Based on your Netlify plan

## Custom Domain

To use a custom domain:

1. Go to **Domain settings** in Netlify
2. Click "Add custom domain"
3. Follow the DNS configuration steps
4. Enable HTTPS (automatic with Netlify)

## Continuous Deployment

Netlify automatically deploys when you push to your main branch:

1. Push changes to Git
2. Netlify detects the push
3. Builds and deploys automatically
4. Previous deployment is kept as fallback

## Resources

- [Netlify Next.js Documentation](https://docs.netlify.com/frameworks/next-js/)
- [Neon Serverless Driver](https://neon.tech/docs/serverless/serverless-driver)
- [PostgreSQL Connection Pooling](https://neon.tech/docs/connect/connection-pooling)
