1. api-1    | INFO:     172.21.0.6:36310 - "POST /api/auth/google HTTP/1.1" 401 Unauthorized
web-1    | 172.64.66.1 - - [14/Sep/2026:18:49:41 +0000] "POST /api/auth/google HTTP/1.1" 401 132 "http://localhost/login" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0" "-"

the google sign in issue still prsists


now when i try to do a nromal email password sign in
this shows up
Login illustration

Session expired. Please sign in again.

even though both of these are correct
fix this idk hw
only create account using normal email and password is working
fix this entire auth bro

2. from this route "http://localhost/learn/math10-euclid-s-division-lemma?subject=maths&chapter=c10-real-numbers&lang=hi"
remove this entirely since the option is only available once the video has been watched
Talk to your AI Mentor
Practice quiz still generating — check the Practice tab in ~10s

on the same route in the chatbox, just adding **a** asterisk around the text doesn'thelp bruh
the text has to be rendered as bold which its clearly not
ths is how im seeting it

Koi tension nahi 🙂 **Euclid’s Division Lemma** bas itna kehta hai: **Dividend = Divisor × Quotient + Remainder** Matlab: **a = bq + r** jahan **a** = jo number divide karna hai **b** = jis se divide kar rahe ho **q** = answer ka poora hissa **r** = bacha hua hissa Aur **r** hamesha: **0 ≤ r < b** **Example:** **17 = 5 × 3 + 2** Yahan **17** = a **5** = b **3** = q **2** = r Agar chaho, main ek aur super easy example se samjha deta hoon. Bas us part ko re-watch karo jahan **a = bq + r** aata hai.

no formatting, no spacing nothing

fix this
the change has to be in frontend to be rendered in a readble way not the backend

3. 
on this route as well, http://localhost/explain/math10-euclid-s-division-lemma?subject=maths&chapter=c10-real-numbers&lang=hi
"Talk to your AI Mentor" remove this button entirely

the image/svg above "Tap Akara to start listening" is what the ai mentor was supposed to be
clicking on this button should actually run the livekit pipeline
and the figure above this text has a default audio playing right now which is hardocded
fix it


4. http://localhost/practice/math10-euclid-s-division-lemma/listen?subject=maths&chapter=c10-real-numbers&lang=hi
on this page as well, the listen should actually fetch the audio only of the video from the R2 bucket and maybe just play the audio no video

5. http://localhost/practice/math10-euclid-s-division-lemma/card?subject=maths&chapter=c10-real-numbers&lang=hi
on this route, the card is harcoded for law of conservation of mass in the frontend
it should fetch data from the backend

6. http://localhost/practice/math10-euclid-s-division-lemma/quiz?subject=maths&chapter=c10-real-numbers&lang=hi
on this route the quiz is taking too much time to render and not rendering either
im not even sure whether the quiz is even generating


7. even in the liekit pipeline, the first questin that the agent asks must be in the same language that the user has chosen during the signup
its right now refaulted to english
fix this as well



8. 
