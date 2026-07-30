import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client"
import { setContext } from "@apollo/client/link/context"
import { load } from "../lib/storage"

const httpLink = createHttpLink({
  uri: "https://graphql.anilist.co"
})

const authLink = setContext((_, { headers }) => {
  const token = load<string>("accessToken")
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  }
})

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
})
