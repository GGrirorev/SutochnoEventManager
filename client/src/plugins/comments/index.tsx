import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { MessageSquare, Calendar, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CommentsProps {
  eventId: number;
  canComment?: boolean;
}

interface Comment {
  id: number;
  eventId: number;
  author: string;
  content: string;
  createdAt: string;
}

export default function Comments({ eventId, canComment = true }: CommentsProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["/api/events", eventId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventId}/comments`, {
        credentials: 'include'
      });
      return res.json();
    }
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/events/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ content, author: "Пользователь" })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "comments"] });
      setComment("");
    }
  });

  return (
    <div className="border-t pt-6" data-testid="plugin-comments">
      <h4 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5" />
        Комментарии ({comments.length})
      </h4>
      
      <div className="space-y-4 mb-6">
        {comments.map((c) => (
          <div key={c.id} className="bg-muted/30 p-3 rounded-lg border border-border/50" data-testid={`comment-${c.id}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold">{c.author}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(c.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
              </span>
            </div>
            <p className="text-sm text-foreground/90">{c.content}</p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {canComment ? "Нет комментариев. Будьте первым!" : "Нет комментариев."}
          </p>
        )}
      </div>

      {canComment && (
        <div className="flex gap-2">
          <Textarea 
            placeholder="Оставьте комментарий к событию..." 
            className="min-h-[80px] text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            data-testid="input-comment"
          />
          <Button 
            size="icon" 
            className="self-end" 
            disabled={!comment.trim() || commentMutation.isPending}
            onClick={() => commentMutation.mutate(comment)}
            data-testid="button-send-comment"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
