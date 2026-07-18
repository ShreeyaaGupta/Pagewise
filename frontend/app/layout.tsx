import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import type { Metadata } from 'next'
import Sidebar from './components/Sidebar'

export const metadata: Metadata = {
  title: 'Pagewise - AI Research Workspace',
  description: 'Intelligent multi-document research engine',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="flex h-screen w-screen bg-gray-50 overflow-hidden">
          {/* Sidebar takes up fixed width on the left */}
          <Sidebar />
          
          {/* The main workspace page contents load on the right */}
          <main className="flex-1 flex flex-col h-full relative overflow-hidden">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}