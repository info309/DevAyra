import React, { useRef, useEffect, useState } from 'react';

interface IsolatedEmailRendererProps {
  content: string;
  className?: string;
}

const IsolatedEmailRenderer: React.FC<IsolatedEmailRendererProps> = ({ content, className = "" }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(400);

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
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #374151;
              background: transparent;
              word-wrap: break-word;
              overflow-wrap: break-word;
              -webkit-text-size-adjust: 100%;
              -ms-text-size-adjust: 100%;
            }
            
            /* Email content styling - Handle both modern and table-based layouts */
            table {
              border-collapse: collapse !important;
              mso-table-lspace: 0pt !important;
              mso-table-rspace: 0pt !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            
            td, th {
              border-collapse: collapse;
              mso-line-height-rule: exactly;
            }
            
            /* Center tables and content */
            table[align="center"], 
            .center,
            center {
              margin: 0 auto !important;
            }
            
            /* Handle Outlook-specific elements */
            .ExternalClass,
            .ExternalClass p,
            .ExternalClass span,
            .ExternalClass font,
            .ExternalClass td,
            .ExternalClass div {
              line-height: 100% !important;
            }
            
            /* Image handling */
            img {
              max-width: 100% !important;
              height: auto !important;
              display: block;
              margin: 8px auto;
              -ms-interpolation-mode: bicubic;
              object-fit: contain;
              border-radius: 4px;
            }
            
            /* Company logos and small branding images */
            img[width="1"], img[height="1"], img[style*="width:1px"], img[style*="height:1px"],
            img[src*="tracking"], img[src*="pixel"], img[src*="beacon"] {
              display: none !important;
            }
            
            /* Logo optimization - detect common logo patterns */
            img[alt*="logo" i], img[src*="logo" i], img[alt*="brand" i], 
            img[class*="logo"], img[id*="logo"], img[style*="logo"] {
              max-width: 200px !important;
              max-height: 80px !important;
              margin: 12px auto !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }
            
            /* Content images */
            img:not([alt*="logo" i]):not([src*="logo" i]):not([alt*="brand" i]) {
              max-height: 400px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            /* Handle broken/missing images */
            img[src=""], img:not([src]) {
              display: none !important;
            }
            
            /* CID (Content-ID) images - try to decode inline attachments */
            img[src^="cid:"] {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              padding: 20px;
              border-radius: 8px;
              position: relative;
            }
            
            img[src^="cid:"]:before {
              content: "📎 Attachment: " attr(alt);
              display: block;
              color: #6c757d;
              font-size: 12px;
              text-align: center;
            }
            
            /* Mobile optimizations */
            @media screen and (max-width: 480px) {
              img {
                max-height: 250px !important;
                margin: 6px auto !important;
              }
              
              img[alt*="logo" i], img[src*="logo" i], img[alt*="brand" i] {
                max-width: 150px !important;
                max-height: 60px !important;
                margin: 8px auto !important;
              }
              
              body {
                padding: 12px !important;
              }
            }
            
            /* Links */
            a {
              color: #3b82f6 !important;
              text-decoration: underline;
            }
            
            a:hover {
              text-decoration-color: transparent;
            }
            
            /* Text elements */
            p, div, span, h1, h2, h3, h4, h5, h6 {
              max-width: 100% !important;
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
            }
            
            /* Responsive handling */
            @media screen and (max-width: 600px) {
              table {
                width: 100% !important;
                min-width: 100% !important;
              }
              
              td {
                width: 100% !important;
                display: block !important;
              }
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
                height: Math.max(height + 40, 300)
              }, '*');
            }
            
            // Initial height calculation
            setTimeout(updateHeight, 50);
            
            // Watch for content changes (images loading, etc.)
            if (window.ResizeObserver) {
              const observer = new ResizeObserver(updateHeight);
              observer.observe(document.body);
            }
            
            // Listen for image load events and errors
            document.addEventListener('load', updateHeight, true);
            document.addEventListener('DOMContentLoaded', updateHeight);
            
            // Handle broken images
            document.addEventListener('error', function(e) {
              if (e.target && e.target.tagName === 'IMG') {
                e.target.style.display = 'none';
                updateHeight();
              }
            }, true);
            
            // Update on window resize
            window.addEventListener('resize', updateHeight);
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
    <div className={`email-renderer-container ${className}`} style={{ overflow: 'visible' }}>
      <iframe
        ref={iframeRef}
        className="w-full border-0 bg-transparent"
        style={{ 
          height: `${iframeHeight}px`,
          minHeight: '300px',
          overflow: 'visible',
          display: 'block'
        }}
        sandbox="allow-same-origin"
        title="Email Content"
      />
    </div>
  );
};

export default IsolatedEmailRenderer;