import React, { useRef, useEffect } from 'react';

interface IsolatedEmailContentProps {
  content: string;
}

const IsolatedEmailContent: React.FC<IsolatedEmailContentProps> = ({ content }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (doc) {
        // Create completely isolated HTML with refined styles
        const isolatedHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              /* Complete CSS reset */
              * {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
                box-sizing: border-box;
              }
              
              /* Base styles */
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #374151;
                background: #ffffff;
                margin: 0;
                padding: 20px;
                overflow-wrap: break-word;
                word-wrap: break-word;
                min-height: 100vh;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              
              /* Typography */
              p { 
                margin-bottom: 16px; 
                line-height: 1.6;
              }
              h1, h2, h3, h4, h5, h6 { 
                margin-bottom: 16px; 
                font-weight: 600; 
                line-height: 1.3;
              }
              h1 { font-size: 24px; color: #1f2937; }
              h2 { font-size: 20px; color: #1f2937; }
              h3 { font-size: 18px; color: #1f2937; }
              h4 { font-size: 16px; color: #1f2937; }
              
              /* Links */
              a {
                color: #3b82f6;
                text-decoration: underline;
                transition: color 0.2s ease;
              }
              a:hover {
                color: #1d4ed8;
                text-decoration: none;
              }
              
              /* Images with better handling */
              img {
                max-width: 100% !important;
                height: auto !important;
                border-radius: 6px;
                display: block;
                margin: 12px auto;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                transition: opacity 0.3s ease;
              }
              
              /* Handle broken images */
              img[src=""], img:not([src]), img[src*="cid:"] {
                display: none !important;
              }
              
              /* Image error handling */
              img::before {
                content: "";
                display: block;
                width: 100%;
                height: 100px;
                background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                border-radius: 6px;
                position: relative;
              }
              
              /* Tables */
              table {
                border-collapse: collapse;
                width: 100%;
                margin: 16px 0;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                background: #ffffff;
              }
              
              td, th {
                padding: 12px 16px;
                text-align: left;
                border-bottom: 1px solid #f3f4f6;
                vertical-align: top;
              }
              
              th {
                background: #f9fafb;
                font-weight: 600;
                color: #374151;
              }
              
              tr:last-child td {
                border-bottom: none;
              }
              
              tr:hover {
                background: #f9fafb;
              }
              
              /* Lists */
              ul, ol {
                margin: 16px 0;
                padding-left: 24px;
              }
              
              li {
                margin-bottom: 8px;
                line-height: 1.6;
              }
              
              /* Block elements */
              blockquote {
                margin: 16px 0;
                padding: 16px 20px;
                border-left: 4px solid #3b82f6;
                background: #f8fafc;
                border-radius: 0 6px 6px 0;
                font-style: italic;
                color: #64748b;
              }
              
              /* Code blocks */
              pre, code {
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                background: #f1f5f9;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 13px;
              }
              
              pre {
                padding: 16px;
                margin: 16px 0;
                overflow-x: auto;
                border: 1px solid #e2e8f0;
              }
              
              /* Dividers */
              hr {
                margin: 32px 0;
                border: none;
                height: 1px;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent);
              }
              
              /* Email-specific elements */
              .email-signature {
                margin-top: 32px;
                padding-top: 16px;
                border-top: 1px solid #e5e7eb;
                font-size: 13px;
                color: #6b7280;
              }
              
              /* Outlook/Exchange specific fixes */
              div[style*="font-family"] {
                font-family: inherit !important;
              }
              
              /* Hide tracking pixels and analytics */
              img[width="1"], img[height="1"], img[style*="width:1px"], img[style*="height:1px"] {
                display: none !important;
              }
              
              /* Prevent any CSS from affecting parent */
              html, body {
                isolation: isolate;
                contain: layout style paint;
              }
              
              /* Hide or neutralize potentially problematic elements */
              style, script, link[rel="stylesheet"] {
                display: none !important;
              }
              
              /* Dark mode support */
              @media (prefers-color-scheme: dark) {
                body {
                  background: #1f2937;
                  color: #f3f4f6;
                }
                h1, h2, h3, h4, h5, h6 {
                  color: #ffffff;
                }
                table {
                  background: #374151;
                }
                th {
                  background: #4b5563;
                  color: #f3f4f6;
                }
                tr:hover {
                  background: #4b5563;
                }
                blockquote {
                  background: #374151;
                  color: #d1d5db;
                }
                pre, code {
                  background: #374151;
                  color: #f3f4f6;
                }
              }
            </style>
          </head>
          <body>
            <div class="email-content">
              ${content || '<p style="color: #6b7280; font-style: italic; text-align: center; margin-top: 40px;">No content available</p>'}
            </div>
          </body>
          </html>
        `;
        
        doc.open();
        doc.write(isolatedHTML);
        doc.close();
        
        // Auto-resize iframe to content height
        const resizeIframe = () => {
          const body = doc.body;
          if (body) {
            const height = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              200 // minimum height
            );
            iframe.style.height = `${height + 40}px`; // Add padding
          }
        };
        
        // Handle image loading and errors
        const handleImages = () => {
          const images = doc.querySelectorAll('img');
          images.forEach((img) => {
            // Remove tracking pixels
            if (img.width === 1 || img.height === 1) {
              img.remove();
              return;
            }
            
            // Handle CID references and broken images
            if (!img.src || img.src.includes('cid:') || img.src === '') {
              img.style.display = 'none';
              return;
            }
            
            // Add loading state
            img.style.opacity = '0';
            
            img.onload = () => {
              img.style.opacity = '1';
              resizeIframe();
            };
            
            img.onerror = () => {
              img.style.display = 'none';
              resizeIframe();
            };
          });
        };
        
        // Initial setup
        setTimeout(() => {
          handleImages();
          resizeIframe();
        }, 100);
        
        // Resize on content changes
        const observer = new MutationObserver(() => {
          handleImages();
          resizeIframe();
        });
        observer.observe(doc.body, { 
          childList: true, 
          subtree: true, 
          attributes: true 
        });
        
        // Prevent navigation and handle clicks
        iframe.contentWindow?.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A') {
            e.preventDefault();
            const href = (target as HTMLAnchorElement).href;
            if (href && (href.startsWith('http') || href.startsWith('mailto:'))) {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          }
        });
        
        return () => observer.disconnect();
      }
    }
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      style={{
        width: '100%',
        minHeight: '200px',
        border: 'none',
        background: 'transparent',
        isolation: 'isolate',
        contain: 'layout style paint size'
      }}
      sandbox="allow-same-origin"
      title="Email Content"
    />
  );
};

export default IsolatedEmailContent;