import { handleCommunityFiles } from '../../_shared/community-files.js'
export function onRequest({request,env}) { return handleCommunityFiles(request,env) }
