export interface Conversation {
  id: string;
  threadId: string;
  subject: string;
  emails: any[];
  messageCount: number;
  lastDate: string;
  unreadCount: number;
  participants: string[];
}

export interface ConversationCluster {
  id: string;
  conversations: Conversation[];
  subject: string;
  participants: string[];
  messageCount: number;
  lastDate: string;
  unreadCount: number;
}

// Normalize email addresses by removing display names and converting to lowercase
export function normalizeEmailAddress(email: string): string {
  if (!email) return '';
  
  // Extract email from "Display Name <email@domain.com>" format
  const match = email.match(/<([^>]+)>/);
  const cleanEmail = match ? match[1] : email;
  
  return cleanEmail.toLowerCase().trim();
}

// Extract domain from email address
export function getEmailDomain(email: string): string {
  const normalized = normalizeEmailAddress(email);
  const atIndex = normalized.lastIndexOf('@');
  return atIndex > -1 ? normalized.substring(atIndex + 1) : '';
}

// Normalize subject by removing common prefixes and suffixes
export function normalizeSubject(subject: string): string {
  if (!subject) return '';
  
  let normalized = subject.toLowerCase().trim();
  
  // Remove common prefixes (case insensitive)
  const prefixes = ['re:', 'fwd:', 'fw:', 'aw:', 'sv:', 'vs:', '[external]'];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length).trim();
    }
  }
  
  // Remove common suffixes and patterns
  normalized = normalized
    .replace(/\[[^\]]*\]$/g, '') // Remove trailing [tags]
    .replace(/\([^)]*\)$/g, '') // Remove trailing (info)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
}

// Calculate similarity between two subjects (0-1 score)
export function calculateSubjectSimilarity(subject1: string, subject2: string): number {
  const norm1 = normalizeSubject(subject1);
  const norm2 = normalizeSubject(subject2);
  
  if (norm1 === norm2) return 1;
  if (!norm1 || !norm2) return 0;
  
  // Simple word-based similarity
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = (2 * commonWords.length) / (words1.length + words2.length);
  
  return similarity;
}

// Calculate participant overlap between two conversations (0-1 score)
export function calculateParticipantOverlap(participants1: string[], participants2: string[]): number {
  const norm1 = participants1.map(normalizeEmailAddress).filter(Boolean);
  const norm2 = participants2.map(normalizeEmailAddress).filter(Boolean);
  
  if (norm1.length === 0 || norm2.length === 0) return 0;
  
  const intersection = norm1.filter(p => norm2.includes(p));
  const union = [...new Set([...norm1, ...norm2])];
  
  return intersection.length / union.length;
}

// Check if two conversations should be clustered together
export function shouldClusterConversations(conv1: Conversation, conv2: Conversation): boolean {
  // 1. Check participant overlap (at least 50% overlap)
  const participantOverlap = calculateParticipantOverlap(conv1.participants, conv2.participants);
  if (participantOverlap < 0.5) return false;
  
  // 2. Check subject similarity (at least 60% similar)
  const subjectSimilarity = calculateSubjectSimilarity(conv1.subject, conv2.subject);
  if (subjectSimilarity < 0.6) return false;
  
  // 3. Check time proximity (within 30 days)
  const timeDiff = Math.abs(new Date(conv1.lastDate).getTime() - new Date(conv2.lastDate).getTime());
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
  if (daysDiff > 30) return false;
  
  return true;
}

// Group conversations into smart clusters
export function createSmartClusters(conversations: Conversation[]): ConversationCluster[] {
  if (conversations.length === 0) return [];
  
  // Sort conversations by last date (most recent first)
  const sortedConversations = [...conversations].sort((a, b) => 
    new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
  );
  
  const clusters: ConversationCluster[] = [];
  const processedIds = new Set<string>();
  
  for (const conversation of sortedConversations) {
    if (processedIds.has(conversation.id)) continue;
    
    // Start a new cluster with this conversation
    const clusterConversations = [conversation];
    processedIds.add(conversation.id);
    
    // Find other conversations that should be in this cluster
    for (const otherConv of sortedConversations) {
      if (processedIds.has(otherConv.id)) continue;
      
      if (shouldClusterConversations(conversation, otherConv)) {
        clusterConversations.push(otherConv);
        processedIds.add(otherConv.id);
      }
    }
    
    // Sort conversations within cluster by last date (most recent first)
    clusterConversations.sort((a, b) => 
      new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
    );
    
    // Create cluster metadata
    const allParticipants = [...new Set(
      clusterConversations.flatMap(c => c.participants)
    )];
    
    const totalMessageCount = clusterConversations.reduce((sum, c) => sum + c.messageCount, 0);
    const totalUnreadCount = clusterConversations.reduce((sum, c) => sum + c.unreadCount, 0);
    const mostRecentDate = clusterConversations[0].lastDate;
    
    // Use the most recent conversation's subject as the cluster subject
    const clusterSubject = clusterConversations[0].subject;
    
    clusters.push({
      id: `cluster_${conversation.id}`,
      conversations: clusterConversations,
      subject: clusterSubject,
      participants: allParticipants,
      messageCount: totalMessageCount,
      lastDate: mostRecentDate,
      unreadCount: totalUnreadCount
    });
  }
  
  // Sort clusters by last date (most recent first)
  return clusters.sort((a, b) => 
    new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
  );
}

// Convert clusters back to flat conversation list for display compatibility
export function flattenClusters(clusters: ConversationCluster[]): Conversation[] {
  const flatConversations: Conversation[] = [];
  
  for (const cluster of clusters) {
    if (cluster.conversations.length === 1) {
      // Single conversation cluster - add as-is
      flatConversations.push(cluster.conversations[0]);
    } else {
      // Multi-conversation cluster - create a merged conversation
      const primaryConv = cluster.conversations[0];
      const allEmails = cluster.conversations.flatMap(c => c.emails);
      
      // Sort all emails chronologically
      allEmails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const mergedConversation: Conversation = {
        id: cluster.id,
        threadId: cluster.id,
        subject: cluster.subject,
        emails: allEmails,
        messageCount: cluster.messageCount,
        lastDate: cluster.lastDate,
        unreadCount: cluster.unreadCount,
        participants: cluster.participants
      };
      
      flatConversations.push(mergedConversation);
    }
  }
  
  return flatConversations;
}