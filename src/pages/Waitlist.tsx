import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

const Waitlist = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <ArrowRight className="w-8 h-8 text-primary-foreground" />
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-12">
          <div className="relative mb-8">
            <img 
              src="/ayra-logo.png" 
              alt="Ayra" 
              className="w-32 h-32 mx-auto mb-8 object-contain"
            />
            <div className="w-64 h-64 mx-auto rounded-full bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center mb-8">
              <div className="text-6xl">🚀</div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/10 backdrop-blur-sm rounded-lg px-6 py-3 mt-32">
                <h2 className="text-2xl font-bold text-foreground">
                  elite productivity
                </h2>
                <h2 className="text-2xl font-bold text-foreground">
                  platform.
                </h2>
              </div>
            </div>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Introducing the world's
          </h1>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            <span className="underline decoration-primary decoration-4">most integrated</span> workspace™
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
          
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">AI-powered productivity is coming.</p>
            <p className="font-bold">Join the waiting list.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Waitlist;