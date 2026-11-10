import { handleCommunityFiles, cleanupCommunityFiles } from '../../functions/_shared/community-files.js'
export default {
  fetch(request,env) {
    if(new URL(request.url).pathname!=='/api/community/files') return new Response(null,{status:404})
    return handleCommunityFiles(request,env)
  },
  async scheduled(_event,env) { await cleanupCommunityFiles(env) },
}
