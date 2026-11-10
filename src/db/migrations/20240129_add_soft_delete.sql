-- Add is_active column to community_posts
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add is_active column to community_comments
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add is_active column to manga_comments
ALTER TABLE manga_comments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
