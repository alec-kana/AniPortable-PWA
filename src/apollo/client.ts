import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client"
import { setContext } from "@apollo/client/link/context"
import { Storage } from "../lib/storage"

const getToken = async (): Promise<string | null> => Storage.get<string>(Storage.DATA.ACCESS_TOKEN)

const httpLink = createHttpLink({
  uri: "https://graphql.anilist.co"
})

const authLink = setContext(async (_, { headers }) => {
  const token = await getToken()
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
