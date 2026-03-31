import { defineCollection, defineConfig } from "@content-collections/core"
import { compileMDX } from "@content-collections/mdx"
import { remarkGfm } from "fumadocs-core/mdx-plugins"
import GithubSlugger from "github-slugger"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeSlug from "rehype-slug"
import { z } from "zod"

function generateSlug(title: string, customSlug?: string): string {
  if (customSlug) return customSlug
  const slugger = new GithubSlugger()
  return slugger.slug(title)
}

function extractTableOfContents(content: string): Array<{ title: string; slug: string }> {
  const headings = content.match(/^##\s(.+)$/gm)
  const slugger = new GithubSlugger()
  return (
    headings?.map((heading: string) => {
      const title = heading.replace(/^##\s/, "")
      return {
        title,
        slug: slugger.slug(title),
      }
    }) || []
  )
}

function extractImages(content: string): string[] {
  return content.match(/(?<=<Image[^>]*\bsrc=")[^"]+(?="[^>]*\/>)/g) || []
}

function extractTweetIds(content: string): string[] {
  const tweetMatches = content.match(/<Tweet\sid="[0-9]+"\s\/>/g)
  return tweetMatches?.map((tweet: string) => {
    const match = tweet.match(/[0-9]+/g)
    return match ? match[0] : ""
  }).filter(Boolean) || []
}

function extractGithubRepos(content: string): string[] {
  return content.match(/(?<=<GithubRepo[^>]*\burl=")[^"]+(?="[^>]*\/>)/g) || []
}

function calculateReadingTime(content: string): number {
  // Remove MDX/JSX components and frontmatter
  const cleanContent = content
    .replace(/<[^>]*>/g, "") // Remove HTML/JSX tags
    .replace(/[#*`_~\[\]]/g, "") // Remove markdown syntax
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
    .trim()

  const words = cleanContent.split(/\s+/).length
  const wordsPerMinute = 200
  const readingTime = Math.ceil(words / wordsPerMinute)

  return readingTime
}

const BlogPost = defineCollection({
  name: "BlogPost",
  directory: "content/blog",
  include: "**/*.mdx",
  schema: z.object({
    title: z.string(),
    categories: z
      .array(z.enum(["company", "marketing", "newsroom", "partners", "engineering", "press"]))
      .default(["company"]),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    featured: z.boolean().default(false),
    image: z.string(),
    images: z.array(z.string()).optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    author: z.string(),
    summary: z.string(),
    related: z.array(z.string()).optional(),
    githubRepos: z.array(z.string()).optional(),
    tweetIds: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription: document.seoDescription || document.summary,
      seoKeywords: document.seoKeywords || [],
      related: document.related || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

const ChangelogPost = defineCollection({
  name: "ChangelogPost",
  directory: "content/changelog",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    summary: z.string(),
    image: z.string(),
    author: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription: document.seoDescription || document.summary,
      seoKeywords: document.seoKeywords || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

export const CustomersPost = defineCollection({
  name: "CustomersPost",
  directory: "content/customers",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    publishedAt: z.string(),
    summary: z.string(),
    image: z.string(),
    company: z.string(),
    companyLogo: z.string(),
    companyUrl: z.string(),
    companyDescription: z.string(),
    companyIndustry: z.string(),
    companySize: z.string(),
    companyFounded: z.number(),
    plan: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription: document.seoDescription || document.summary,
      seoKeywords: document.seoKeywords || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

export const HelpPost = defineCollection({
  name: "HelpPost",
  directory: "content/help",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    updatedAt: z.string(),
    summary: z.string(),
    author: z.string(),
    categories: z
      .array(
        z.enum([
          "overview",
          "getting-started",
          "terms",
          "for-investors",
          "analysis",
          "valuation",
        ]),
      )
      .default(["overview"]),
    related: z.array(z.string()).optional(),
    excludeHeadingsFromSearch: z.boolean().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription: document.seoDescription || document.summary,
      seoKeywords: document.seoKeywords || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

export const LegalPost = defineCollection({
  name: "LegalPost",
  directory: "content/legal",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    updatedAt: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription: document.seoDescription || document.seoTitle || document.title,
      seoKeywords: document.seoKeywords || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

export const IntegrationsPost = defineCollection({
  name: "IntegrationsPost",
  directory: "content/integrations",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    publishedAt: z.string(),
    summary: z.string(),
    image: z.string(),
    company: z.string(),
    companyLogo: z.string(),
    companyUrl: z.string(),
    companyDescription: z.string(),
    integrationType: z.string(),
    integrationDescription: z.string(),
    compatibility: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    seoKeywords: z.array(z.string()).optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.title as string, document.slug as string | undefined),
      mdx,
      seoTitle: document.seoTitle || document.title,
      seoDescription:
        document.seoDescription ||
        document.summary ||
        document.integrationDescription,
      seoKeywords: document.seoKeywords || [],
      tableOfContents: extractTableOfContents(rawContent),
      images: extractImages(rawContent),
      tweetIds: extractTweetIds(rawContent),
      githubRepos: extractGithubRepos(rawContent),
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

const Author = defineCollection({
  name: "Author",
  directory: "content/authors",
  include: "*.mdx",
  schema: z.object({
    name: z.string(),
    role: z.string(),
    avatar: z.string(),
    bio: z.string(),
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    website: z.string().optional(),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.name as string, document.slug as string | undefined),
      mdx,
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

const TeamMember = defineCollection({
  name: "TeamMember",
  directory: "content/team",
  include: "*.mdx",
  schema: z.object({
    name: z.string(),
    role: z.string(),
    department: z.enum(["engineering", "marketing", "sales", "design", "operations", "executive"]),
    avatar: z.string(),
    bio: z.string(),
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    email: z.string().optional(),
    order: z.number().default(0),
    slug: z.string().optional(),
    content: z.string(),
  }),
  transform: async (document, context) => {
    const rawContent = document.content as string
    const mdx = await compileMDX(context, document, {
      rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings],
      remarkPlugins: [remarkGfm],
    })

    return {
      ...document,
      slug: generateSlug(document.name as string, document.slug as string | undefined),
      mdx,
      readingTime: calculateReadingTime(rawContent),
    }
  },
})

export default defineConfig({
  content: [
    BlogPost,
    ChangelogPost,
    CustomersPost,
    HelpPost,
    LegalPost,
    IntegrationsPost,
    Author,
    TeamMember,
  ],
})
