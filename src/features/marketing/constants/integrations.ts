import { Cloud, Globe, Rocket, Server, Waves, Zap } from "lucide-react";
import type { IntegrationCard } from "../types";

export const INTEGRATIONS_CONTENT = {
  heading: "Monitor projects wherever you deploy them",
  description:
    "Upkeep is host-agnostic - register any project's health endpoint regardless of where it runs. Icons below are placeholders until we add real platform logos.",
};

export const INTEGRATION_CARDS: IntegrationCard[] = [
  {
    title: "Render",
    description:
      "Track web services and background workers that spin down after periods of inactivity on Render's free tier.",
    icon: Server,
  },
  {
    title: "Railway",
    description:
      "Keep Railway deployments warm and get notified the moment a health check starts failing.",
    icon: Rocket,
  },
  {
    title: "Vercel",
    description:
      "Monitor edge and serverless functions deployed on Vercel alongside the rest of your portfolio.",
    icon: Zap,
  },
  {
    title: "Fly.io",
    description:
      "Ping Fly.io machines on a schedule to catch cold starts before a visitor ever sees one.",
    icon: Cloud,
  },
  {
    title: "Netlify",
    description:
      "Add a health check to any Netlify site or function and see it alongside your other deployments.",
    icon: Waves,
  },
  {
    title: "Any HTTP(S) endpoint",
    description:
      "No plugin required - if it exposes a health endpoint over HTTP(S), Upkeep can monitor it.",
    icon: Globe,
  },
];
