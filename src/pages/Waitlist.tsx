import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, Pause } from "lucide-react";

const Waitlist = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const handleVideoToggle = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("waitlist")
        .insert([{ email }]);

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          toast({
            title: "Already registered",
            description: "This email is already on our waitlist!",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        setIsSubmitted(true);
        toast({
          title: "You're on the list!",
          description: "We'll notify you when we launch.",
        });
      }
    } catch (error) {
      console.error("Error joining waitlist:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#fff4ed' }}>
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6">
              <img src="/lovable-uploads/waitlist-success.png" alt="Success" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Thank you!
            </h1>
            <p className="text-xl text-muted-foreground mb-6">
              You're now on our waitlist. We'll email you as soon as we launch.
            </p>
            <p className="text-sm text-muted-foreground">
              Please check your inbox (and junk folder) for a confirmation email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-16" style={{ backgroundColor: '#fff4ed' }}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Join the world's
          </h1>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            <span className="underline decoration-primary decoration-4">most integrated</span> workspace.
          </h1>
          
          <form onSubmit={handleSubmit} className="max-w-md mx-auto mb-6">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="EMAIL ADDRESS"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-white/80 border-0 rounded-full px-6 py-3 text-sm uppercase tracking-wider placeholder:text-muted-foreground/60"
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full px-6 py-3 bg-primary hover:bg-primary/90"
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
          
          <div className="text-sm text-muted-foreground mb-12">
            <p className="font-medium mb-1">First 10,000 users - Free plan for life.</p>
            <p className="font-bold">Join the waiting list.</p>
          </div>

          <div className="relative mb-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-4">
                Meet Ayra, your personal AI assistant.
              </h1>
              <p className="text-base text-muted-foreground font-body font-medium max-w-2xl mx-auto">
                Watch how Ayra seamlessly integrates all your productivity tools into one intelligent workspace.
              </p>
            </div>
            
            {/* Mobile: iPhone design */}
            <div className="md:hidden w-80 mx-auto bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl mb-8">
              <div className="aspect-[9/19.5] bg-black rounded-[2rem] overflow-hidden relative cursor-pointer" onClick={handleVideoToggle}>
                {/* iPhone notch */}
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full z-10"></div>
                <video 
                  ref={videoRef}
                  className="w-full h-full object-cover rounded-[2rem]"
                  preload="metadata"
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                >
                  <source src="/AYRA.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {/* Play/Pause Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`transition-opacity duration-300 ${isVideoPlaying ? 'opacity-0' : 'opacity-100'} bg-black/50 rounded-full p-4 hover:bg-black/70`}>
                    {isVideoPlaying ? (
                      <Pause className="w-12 h-12 text-white" />
                    ) : (
                      <Play className="w-12 h-12 text-white ml-1" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tablet and Desktop: iPad Landscape */}
            <div className="hidden md:block w-full max-w-5xl mx-auto bg-gray-900 rounded-[2rem] p-4 shadow-2xl mb-8">
              <div className="aspect-[4/3] bg-black rounded-[1.5rem] overflow-hidden relative cursor-pointer" onClick={handleVideoToggle}>
                {/* iPad home indicator */}
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-600 rounded-full z-10"></div>
                <video 
                  ref={videoRef}
                  className="w-full h-full object-cover rounded-[1.5rem]"
                  preload="metadata"
                  onPlay={() => setIsVideoPlaying(true)}
                  onPause={() => setIsVideoPlaying(false)}
                >
                  <source src="/AYRA.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {/* Play/Pause Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`transition-opacity duration-300 ${isVideoPlaying ? 'opacity-0' : 'opacity-100'} bg-black/50 rounded-full p-4 hover:bg-black/70`}>
                    {isVideoPlaying ? (
                      <Pause className="w-12 h-12 text-white" />
                    ) : (
                      <Play className="w-12 h-12 text-white ml-1" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Waitlist;