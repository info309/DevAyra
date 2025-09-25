import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-heading text-center">Terms of Service</CardTitle>
            <p className="text-center text-muted-foreground">Last updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-lg max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
                <p>
                  By accessing and using Ayra services provided by Stargate Labs Inc UK ("Company," "we," "our," or "us"), you agree to be bound by these Terms of Service and all applicable laws and regulations.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
                <p>
                  Ayra is an AI-powered personal assistant platform that helps you manage emails, calendar events, documents, notes, and other productivity tasks. Our service includes web and mobile applications with AI capabilities.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You must provide accurate and complete information when creating an account</li>
                  <li>You are responsible for maintaining the security of your account credentials</li>
                  <li>You must notify us immediately of any unauthorized use of your account</li>
                  <li>One person or legal entity may not maintain more than one free account</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
                <p>You agree not to use our service to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violate any applicable laws or regulations</li>
                  <li>Transmit harmful, offensive, or illegal content</li>
                  <li>Interfere with or disrupt our services or servers</li>
                  <li>Attempt to gain unauthorized access to other accounts or systems</li>
                  <li>Use our service for commercial purposes without proper authorization</li>
                  <li>Share your account credentials with third parties</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Subscription and Payment</h2>
                <h3 className="text-xl font-semibold mb-2">Free Tier</h3>
                <p>We offer a free tier with limited features and storage capacity.</p>
                
                <h3 className="text-xl font-semibold mb-2 mt-4">Pro Subscription</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Pro subscriptions are billed monthly at £19/month</li>
                  <li>Payment is due in advance of each billing cycle</li>
                  <li>You may cancel your subscription at any time</li>
                  <li>No refunds for partial months of service</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Data and Privacy</h2>
                <p>
                  Your use of our service is governed by our Privacy Policy, which is incorporated into these Terms by reference. We are committed to protecting your data and maintaining your privacy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>You retain ownership of content you create and upload</li>
                  <li>You grant us license to use your content to provide our services</li>
                  <li>Our service, software, and branding remain our intellectual property</li>
                  <li>You may not copy, modify, or reverse engineer our software</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Service Availability</h2>
                <p>
                  We strive to maintain high service availability but cannot guarantee uninterrupted access. We may perform maintenance, updates, or modifications that temporarily affect service availability.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
                <p>
                  To the maximum extent permitted by law, Stargate Labs Inc UK shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of our service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
                <p>
                  Either party may terminate this agreement at any time. Upon termination, your access to the service will cease, and we may delete your data in accordance with our Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">11. Governing Law</h2>
                <p>
                  These Terms are governed by the laws of England and Wales. Any disputes will be resolved in the courts of England and Wales.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
                <p>
                  For questions about these Terms of Service, contact us at:
                </p>
                <p>
                  <strong>Stargate Labs Inc UK</strong><br />
                  Email: legal@ayra.com<br />
                  Address: [Company Address]
                </p>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TermsOfService;