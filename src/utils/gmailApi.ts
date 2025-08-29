import { supabase } from '@/integrations/supabase/client';

interface GmailApiResponse {
  conversations?: any[];
  results?: any[];
  partialSuccess?: boolean;
  errors?: Array<{ item: string; error: string }>;
  nextPageToken?: string;
  allEmailsLoaded?: boolean;
}

interface InvokeOptions {
  body: any;
  signal?: AbortSignal;
  retries?: number;
}

class GmailApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public partialSuccess?: boolean,
    public errors?: Array<{ item: string; error: string }>
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

export const gmailApi = {
  async invoke(options: InvokeOptions): Promise<GmailApiResponse> {
    const { body, signal, retries = 2 } = options;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Get the current session to pass auth token
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          throw new GmailApiError(
            'No active session found. Please log in.',
            401
          );
        }

        const { data, error } = await supabase.functions.invoke('gmail-api', {
          body,
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (error) {
          // Check if it's a transient 5xx error and we have retries left
          if (attempt < retries && error.status && error.status >= 500) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new GmailApiError(
            error.message || 'Gmail API request failed',
            error.status
          );
        }

        // Handle partial success responses
        const response = data as GmailApiResponse;
        if (response.partialSuccess && response.errors?.length) {
          console.warn('Gmail API partial success:', response.errors);
          // Still return the data, but log the errors
        }

        return response;

      } catch (error) {
        if (error instanceof GmailApiError) {
          throw error;
        }

        // Network or other errors
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new GmailApiError(
          error.message || 'Network error',
          0
        );
      }
    }

    throw new GmailApiError('Max retries exceeded');
  },

  // Convenience methods
  async getEmails(query = 'in:inbox', pageToken?: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'getEmails',
        query,
        pageToken,
        maxResults: 50
      },
      signal
    });
  },

  async searchEmails(query: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'searchEmails',
        query
      },
      signal
    });
  },

  async downloadAttachment(messageId: string, attachmentId: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'downloadAttachment',
        messageId,
        attachmentId
      },
      signal
    });
  },

  async markAsRead(messageId?: string, threadId?: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'markAsRead',
        messageId,
        threadId
      },
      signal
    });
  },

  async trashMessage(messageId: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'trashMessage',
        messageId
      },
      signal
    });
  },

  async trashThread(threadId: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'trashThread',
        threadId
      },
      signal
    });
  },

  async deleteMessage(messageId: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'deleteMessage',
        messageId
      },
      signal
    });
  },

  async deleteThread(threadId: string, signal?: AbortSignal) {
    return this.invoke({
      body: { 
        action: 'deleteThread',
        threadId
      },
      signal
    });
  },

  async sendEmail(
    to: string, 
    subject: string, 
    content: string, 
    threadId?: string,
    attachments?: any[],
    signal?: AbortSignal
  ) {
    return this.invoke({
      body: { 
        action: 'sendEmail',
        to,
        subject,
        content,
        threadId,
        attachments
      },
      signal
    });
  },

  async healthCheck(signal?: AbortSignal) {
    return this.invoke({
      body: { action: 'health' },
      signal,
      retries: 0 // Don't retry health checks
    });
  }
};

export { GmailApiError };