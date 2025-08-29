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
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              display: block;
              margin: 10px auto;
              -ms-interpolation-mode: bicubic;
              object-fit: contain;
              max-height: 400px;
              min-height: 40px;
              background: #f8f9fa;
              border: 1px solid #e9ecef;
            }
            
            /* Handle specific image types */
            img[width] {
              width: auto !important;
              max-width: min(100%, attr(width, px)) !important;
            }
            
            img[height] {
              height: auto !important;
              max-height: min(400px, attr(height, px)) !important;
            }
            
            /* Handle broken/missing images */
            img:not([src]), 
            img[src=""], 
            img[src*="cid:"],
            img[src*="data:image/"][src*="base64,"]:not([src*="data:image/"]) {
              display: none !important;
            }
            
            /* Style for images that fail to load */
            img[alt] {
              position: relative;
            }
            
            /* Loading placeholder */
            img:not([src*="data:"]):not([complete]) {
              background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
              background-size: 200% 100%;
              animation: loading 1.5s infinite;
            }
            
            @keyframes loading {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
            
            /* Company logos and branding */
            img[alt*="logo" i], 
            img[alt*="brand" i],
            img[src*="logo" i] {
              max-height: 80px !important;
              width: auto !important;
              object-fit: contain;
            }
            
            /* Email signatures */
            img[width="1"], 
            img[height="1"],
            img[style*="width:1px"],
            img[style*="height:1px"] {
              display: none !important;
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
            
            /* Responsive handling for mobile */
            @media screen and (max-width: 600px) {
              table {
                width: 100% !important;
                min-width: 100% !important;
              }
              
              td {
                width: 100% !important;
                display: block !important;
                padding: 8px !important;
              }
              
              img {
                max-width: 100% !important;
                max-height: 300px !important;
                margin: 5px auto !important;
              }
              
              /* Hide tracking pixels on mobile */
              img[width="1"], img[height="1"] {
                display: none !important;
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
            
            // Handle broken images and improve loading
            document.addEventListener('error', function(e) {
              if (e.target && e.target.tagName === 'IMG') {
                const img = e.target;
                // Hide broken images
                img.style.display = 'none';
                
                // Try to show alt text if available
                if (img.alt && img.alt.trim()) {
                  const fallback = document.createElement('div');
                  fallback.style.cssText = 
                    'padding: 10px;' +
                    'background: #f8f9fa;' +
                    'border: 1px dashed #dee2e6;' +
                    'border-radius: 8px;' +
                    'text-align: center;' +
                    'color: #6c757d;' +
                    'font-style: italic;' +
                    'margin: 10px auto;' +
                    'max-width: 300px;';
                  fallback.textContent = '📷 ' + img.alt;
                  img.parentNode?.insertBefore(fallback, img);
                }
                updateHeight();
              }
            }, true);
            
            // Handle successful image loads
            document.addEventListener('load', function(e) {
              if (e.target && e.target.tagName === 'IMG') {
                updateHeight();
              }
            }, true);
            
            // Clean up common email tracking elements
            setTimeout(() => {
              // Remove tracking pixels and invisible images
              const trackingImages = document.querySelectorAll('img[width="1"], img[height="1"]');
              trackingImages.forEach(img => img.remove());
              
              // Fix images with missing or invalid src
              const brokenImages = document.querySelectorAll('img:not([src]), img[src=""], img[src*="cid:"]');
              brokenImages.forEach(img => {
                if (img.alt && img.alt.trim()) {
                  const placeholder = document.createElement('div');
                  placeholder.style.cssText = 
                    'padding: 15px;' +
                    'background: #f8f9fa;' +
                    'border: 2px dashed #dee2e6;' +
                    'border-radius: 8px;' +
                    'text-align: center;' +
                    'color: #6c757d;' +
                    'font-style: italic;' +
                    'margin: 10px auto;' +
                    'max-width: 200px;';
                  placeholder.textContent = '📷 ' + img.alt;
                  img.parentNode?.replaceChild(placeholder, img);
                } else {
                  img.remove();
                }
              });
              
              updateHeight();
            }, 100);
            
            document.addEventListener('DOMContentLoaded', updateHeight);
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