import React, { useRef, useEffect, useState } from 'react';

interface IsolatedEmailRendererProps {
  content: string;
  className?: string;
}

const IsolatedEmailRenderer: React.FC<IsolatedEmailRendererProps> = ({ content, className = "" }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  useEffect(() => {
    if (!iframeRef.current || !content) return;

    const iframe = iframeRef.current;
    
    // Create isolated HTML document for the email content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            /* Reset and base styles */
            * {
              box-sizing: border-box;
            }
            
            body {
              margin: 0;
              padding: 16px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #374151;
              background: transparent;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            /* Email content styling */
            img {
              max-width: 100% !important;
              height: auto !important;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              display: block;
            }
            
            a {
              color: #3b82f6 !important;
              text-decoration: underline;
            }
            
            a:hover {
              text-decoration-color: transparent;
            }
            
            table {
              width: auto !important;
              max-width: 100% !important;
              border-collapse: collapse;
            }
            
            td, th {
              max-width: 100% !important;
            }
            
            /* Prevent layout breaking */
            div, p, span {
              max-width: 100% !important;
            }
            
            /* Dark mode support */
            @media (prefers-color-scheme: dark) {
              body {
                color: #e5e7eb;
              }
            }
          </style>
        </head>
        <body>
          ${content || '<p style="color: #9ca3af; font-style: italic;">No content available</p>'}
          
          <script>
            // Auto-resize iframe based on content height
            function updateHeight() {
              const height = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
              );
              
              parent.postMessage({
                type: 'resize',
                height: Math.max(height, 100)
              }, '*');
            }
            
            // Initial height calculation
            setTimeout(updateHeight, 100);
            
            // Watch for content changes (images loading, etc.)
            const observer = new ResizeObserver(updateHeight);
            observer.observe(document.body);
            
            // Listen for image load events
            document.addEventListener('load', updateHeight, true);
            
            // Fallback periodic check
            setInterval(updateHeight, 1000);
          </script>
        </body>
      </html>
    `;

    // Write content to iframe
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(emailHtml);
      doc.close();
    }

    // Listen for height updates from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.source === iframe.contentWindow && event.data.type === 'resize') {
        setIframeHeight(event.data.height);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [content]);

  if (!content || content.trim() === '') {
    return (
      <div className={`p-4 text-muted-foreground italic ${className}`}>
        No content available
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className={`w-full border-0 ${className}`}
      style={{ 
        height: `${iframeHeight}px`,
        minHeight: '100px',
        overflow: 'hidden'
      }}
      sandbox="allow-same-origin"
      title="Email Content"
    />
  );
};

export default IsolatedEmailRenderer;