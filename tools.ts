import { tool } from "ai";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { writeFileSync } from "fs";
import { join } from "path";

const excludeFiles = ["dist", "bun.lock"];

const fileChange = z.object({
  rootDir: z.string().min(1).describe("The root directory"),
});

type FileChange = z.infer<typeof fileChange>;

async function getFileChangesInDirectory({ rootDir }: FileChange) {
  const git = simpleGit(rootDir);
  const summary = await git.diffSummary();
  const diffs: { file: string; diff: string }[] = [];

  for (const file of summary.files) {
    if (excludeFiles.includes(file.file)) continue;
    const diff = await git.diff(["--", file.file]);
    diffs.push({ file: file.file, diff });
  }

  return diffs;
}

export const getFileChangesInDirectoryTool = tool({
  description: "Gets the code changes made in given directory",
  inputSchema: fileChange,
  execute: getFileChangesInDirectory,
});

// Commit message generation tool
const commitMessageInput = z.object({
  changes: z.array(z.object({
    file: z.string(),
    diff: z.string()
  })).describe("Array of file changes with diffs"),
  type: z.enum(["feat", "fix", "docs", "style", "refactor", "test", "chore"]).optional().describe("Type of commit (conventional commits)"),
});

type CommitMessageInput = z.infer<typeof commitMessageInput>;

async function generateCommitMessage({ changes, type }: CommitMessageInput) {
  // Analyze changes to determine commit type if not provided
  let commitType = type;
  if (!commitType) {
    // Simple heuristics to determine commit type
    const hasNewFeatures = changes.some(change => 
      change.diff.includes('+') && 
      (change.diff.includes('function') || change.diff.includes('class') || change.diff.includes('export'))
    );
    const hasBugFixes = changes.some(change => 
      change.diff.includes('fix') || change.diff.includes('bug') || change.diff.includes('error')
    );
    const hasDocChanges = changes.some(change => 
      change.file.includes('.md') || change.file.includes('README')
    );
    const hasTestChanges = changes.some(change => 
      change.file.includes('.test.') || change.file.includes('.spec.')
    );
    
    if (hasNewFeatures) commitType = 'feat';
    else if (hasBugFixes) commitType = 'fix';
    else if (hasDocChanges) commitType = 'docs';
    else if (hasTestChanges) commitType = 'test';
    else commitType = 'chore';
  }

  // Generate summary of changes
  const fileNames = changes.map(change => change.file);
  const summary = fileNames.length === 1 
    ? `update ${fileNames[0]}`
    : `update ${fileNames.length} files`;

  // Create conventional commit message
  const commitMessage = `${commitType}: ${summary}`;
  
  // Add body with file details if multiple files
  let fullMessage = commitMessage;
  if (fileNames.length > 1) {
    fullMessage += '\n\nFiles modified:\n' + fileNames.map(file => `- ${file}`).join('\n');
  }

  return {
    message: commitMessage,
    fullMessage,
    type: commitType,
    filesChanged: fileNames.length
  };
}

export const generateCommitMessageTool = tool({
  description: "Generates a conventional commit message based on file changes",
  inputSchema: commitMessageInput,
  execute: generateCommitMessage,
});

// Markdown file generation tool
const markdownInput = z.object({
  title: z.string().describe("Title of the markdown document"),
  content: z.string().describe("Main content of the markdown document"),
  outputPath: z.string().describe("Path where the markdown file should be saved"),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string()
  })).optional().describe("Optional sections to add to the document"),
  metadata: z.object({
    author: z.string().optional(),
    date: z.string().optional(),
    tags: z.array(z.string()).optional()
  }).optional().describe("Optional metadata for the document")
});

type MarkdownInput = z.infer<typeof markdownInput>;

async function generateMarkdownFile({ title, content, outputPath, sections, metadata }: MarkdownInput) {
  let markdownContent = `# ${title}\n\n`;
  
  // Add metadata if provided
  if (metadata) {
    markdownContent += '---\n';
    if (metadata.author) markdownContent += `author: ${metadata.author}\n`;
    if (metadata.date) markdownContent += `date: ${metadata.date}\n`;
    if (metadata.tags && metadata.tags.length > 0) {
      markdownContent += `tags: [${metadata.tags.join(', ')}]\n`;
    }
    markdownContent += '---\n\n';
  }
  
  // Add main content
  markdownContent += `${content}\n\n`;
  
  // Add sections if provided
  if (sections && sections.length > 0) {
    sections.forEach(section => {
      markdownContent += `## ${section.heading}\n\n${section.content}\n\n`;
    });
  }
  
  // Write file
  try {
    writeFileSync(outputPath, markdownContent, 'utf8');
    return {
      success: true,
      path: outputPath,
      size: markdownContent.length,
      preview: markdownContent.substring(0, 200) + (markdownContent.length > 200 ? '...' : '')
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      path: outputPath
    };
  }
}

export const generateMarkdownFileTool = tool({
  description: "Generates and saves a markdown file with specified content and structure",
  inputSchema: markdownInput,
  execute: generateMarkdownFile,
});