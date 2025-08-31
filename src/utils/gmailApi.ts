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
      console.log('Getting current session for Gmail API request');
      
      // First, try to get the current session
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new GmailApiError('Authentication failed', 401);
      }
      
      if (!session?.access_token) {
        console.error('No access token in session');
        throw new GmailApiError('No active session found. Please log in.', 401);
      }
      
      console.log('Session found, checking token validity');
      console.log('Token expires at:', new Date(session.expires_at! * 1000).toISOString());
      
      // Check if token is expired or close to expiring (within 1 minute)
      const now = Math.floor(Date.now() / 1000);
      const tokenExp = session.expires_at || 0;
      
      if (tokenExp <= now || (tokenExp - now < 60)) {
        console.log('Token expired or expiring soon, refreshing session...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          console.error('Failed to refresh session:', refreshError);
          // Clear potentially stale session
          await supabase.auth.signOut();
          throw new GmailApiError('Session expired. Please log in again.', 401);
        }
        
        session = refreshData.session;
        console.log('Session refreshed successfully, new expiry:', new Date(session.expires_at! * 1000).toISOString());
      }
      
      const authToken = session.access_token;
      
      if (!authToken) {
        throw new GmailApiError('No authentication token available', 401);
      }
      
      console.log('Making Gmail API request for user:', JSON.stringify(body, null, 2));

      const { data, error } = await supabase.functions.invoke('gmail-api', {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Check if it's a transient 5xx error and we have retries left
        if (attempt < retries && error.status && error.status >= 500) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
          console.log(`Retrying after ${delay}ms due to ${error.status} error`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Handle 401 errors with session refresh and retry
        if (error.status === 401 && attempt < retries) {
          console.log(`Authentication failed on attempt ${attempt + 1}, refreshing session and retrying...`);
          
          try {
            const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError || !refreshedSession.session) {
              console.error('Session refresh failed:', refreshError);
              // Clear local storage and redirect to auth
              localStorage.clear();
              window.location.href = '/auth';
              throw new GmailApiError('Session expired. Please log in again.', 401);
            }
            
            console.log('Session refreshed successfully, retrying...');
            continue; // Retry with refreshed session
          } catch (refreshErr) {
            console.error('Session refresh error:', refreshErr);
            localStorage.clear();
            window.location.href = '/auth';
            throw new GmailApiError('Session expired. Please log in again.', 401);
          }
        }
        
        // If we've exhausted retries or it's not a 401, handle as before
        if (error.status === 401) {
          console.error('Authentication failed after retries - redirecting to login');
          localStorage.clear();
          window.location.href = '/auth';
          throw new GmailApiError('Session expired. Please log in again.', 401);
        }
        
        throw new GmailApiError(
          error.message || 'Gmail API request failed',
          error.status
        );
      }

      if (!data) {
        throw new GmailApiError('No data received from Gmail API', 500);
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