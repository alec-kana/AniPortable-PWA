import { gql } from "@apollo/client"

// Shared by every component that needs the logged-in user's id. Keep it as one
// document: Apollo only serves these from cache (rather than refetching) while
// the selection set stays identical across all of them. The header's name and
// avatar come from localStorage via useAuth, not from here.
export const VIEWER_QUERY = gql`
  query {
    Viewer {
      id
    }
  }
`
